import io
import re
from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, Cycle, Transaction, TransactionType
from routes.auth import get_current_user
from nlp_engine import generate_report_summary

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ──────────────────────────────────────────────────────────────
#  Core analysis (shared by the JSON endpoint and the PDF export)
# ──────────────────────────────────────────────────────────────

def _normalize(text: Optional[str]) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


def _cadence_from_dates(dates: List[datetime]) -> str:
    """Rough human label for how often something repeats."""
    if len(dates) < 2:
        return "One-off"
    dates = sorted(dates)
    gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    avg_gap = sum(gaps) / len(gaps)
    if avg_gap <= 10:
        return "Weekly / frequent"
    if avg_gap <= 40:
        return "Monthly"
    if avg_gap <= 100:
        return "Every few months"
    return "Irregular"


def build_analysis(db: Session, user_id: int) -> dict:
    """Scan every transaction across all months and compute the full report."""
    user_cycle_ids = [c.id for c in db.query(Cycle).filter(Cycle.user_id == user_id).all()]
    txs = (
        db.query(Transaction).filter(Transaction.cycle_id.in_(user_cycle_ids)).all()
        if user_cycle_ids else []
    )

    total_income = sum(t.amount for t in txs if t.type in (TransactionType.INCOME, TransactionType.SALARY))
    total_expenses = sum(t.amount for t in txs if t.type == TransactionType.EXPENSE)
    expense_txs = [t for t in txs if t.type == TransactionType.EXPENSE]

    # ── Per-month breakdown ──────────────────────────────
    monthly = defaultdict(lambda: {"income": 0.0, "expenses": 0.0, "count": 0})
    for t in txs:
        key = t.date.strftime("%Y-%m")
        monthly[key]["count"] += 1
        if t.type in (TransactionType.INCOME, TransactionType.SALARY):
            monthly[key]["income"] += t.amount
        elif t.type == TransactionType.EXPENSE:
            monthly[key]["expenses"] += t.amount

    by_month = []
    for key in sorted(monthly.keys()):
        d = monthly[key]
        by_month.append({
            "month": key,
            "label": datetime.strptime(key, "%Y-%m").strftime("%b %Y"),
            "income": round(d["income"], 2),
            "expenses": round(d["expenses"], 2),
            "net": round(d["income"] - d["expenses"], 2),
            "count": d["count"],
        })

    # ── Per-category breakdown (expenses only) ───────────
    cat_totals = defaultdict(lambda: {"total": 0.0, "count": 0})
    for t in expense_txs:
        cat = (t.category or "other").lower()
        cat_totals[cat]["total"] += t.amount
        cat_totals[cat]["count"] += 1

    by_category = sorted(
        [
            {
                "category": cat,
                "total": round(v["total"], 2),
                "count": v["count"],
                "pct": round((v["total"] / total_expenses * 100) if total_expenses else 0, 1),
            }
            for cat, v in cat_totals.items()
        ],
        key=lambda x: x["total"], reverse=True,
    )

    # ── Recurring detection ──────────────────────────────
    # Group expenses by (category, normalized description). Anything appearing
    # in 2+ distinct months is treated as recurring.
    groups = defaultdict(list)
    for t in expense_txs:
        desc = _normalize(t.description)
        cat = (t.category or "other").lower()
        key = (cat, desc) if desc else (cat, "")
        groups[key].append(t)

    recurring = []
    for (cat, desc), items in groups.items():
        months_seen = {t.date.strftime("%Y-%m") for t in items}
        if len(months_seen) < 2:
            continue
        amounts = [t.amount for t in items]
        dates = [t.date for t in items]
        last = max(items, key=lambda t: t.date)
        label = (desc.title() if desc else cat.title())
        recurring.append({
            "label": label,
            "category": cat,
            "description": desc,
            "occurrences": len(items),
            "months_seen": len(months_seen),
            "avg_amount": round(sum(amounts) / len(amounts), 2),
            "total_amount": round(sum(amounts), 2),
            "cadence": _cadence_from_dates(dates),
            "last_date": last.date.strftime("%Y-%m-%d"),
            "last_amount": round(last.amount, 2),
        })
    recurring.sort(key=lambda x: x["total_amount"], reverse=True)

    months_count = len(monthly)
    totals = {
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "net": round(total_income - total_expenses, 2),
        "months_count": months_count,
        "txn_count": len(txs),
        "avg_monthly_expense": round(total_expenses / months_count, 2) if months_count else 0.0,
        "recurring_monthly_estimate": round(
            sum(r["avg_amount"] for r in recurring if r["cadence"] == "Monthly"), 2
        ),
    }

    date_range = None
    if txs:
        first = min(t.date for t in txs)
        last = max(t.date for t in txs)
        date_range = {
            "from": first.strftime("%b %Y"),
            "to": last.strftime("%b %Y"),
        }

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": date_range,
        "totals": totals,
        "by_month": by_month,
        "by_category": by_category,
        "recurring": recurring,
    }


# ──────────────────────────────────────────────────────────────
#  JSON endpoint (drives the on-screen report)
# ──────────────────────────────────────────────────────────────

def _analysis_with_summary(db: Session, user_id: int) -> dict:
    """Build the full analysis and attach the AI narrative summary."""
    analysis = build_analysis(db, user_id)
    # Give the model a trimmed view to keep tokens low.
    stats_for_ai = {
        "totals": analysis["totals"],
        "date_range": analysis["date_range"],
        "by_category": analysis["by_category"][:8],
        "recurring": analysis["recurring"][:10],
        "by_month": analysis["by_month"][-6:],
    }
    analysis["summary"] = generate_report_summary(stats_for_ai)
    return analysis


@router.get("/analysis")
def get_analysis(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return _analysis_with_summary(db, current_user.id)


# ──────────────────────────────────────────────────────────────
#  PDF export
# ──────────────────────────────────────────────────────────────

@router.get("/pdf")
def get_pdf(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    analysis = _analysis_with_summary(db, current_user.id)
    pdf_bytes = build_pdf(analysis, username=current_user.username)
    filename = f"FinAI-Report-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ──────────────────────────────────────────────────────────────
#  Email export
# ──────────────────────────────────────────────────────────────

class EmailRequest(BaseModel):
    to: str


@router.post("/email")
def email_report(
    body: EmailRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import os
    import smtplib
    from email.message import EmailMessage
    from fastapi import HTTPException

    recipient = (body.to or "").strip()
    if "@" not in recipient or "." not in recipient:
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    sender = os.getenv("SMTP_FROM", user or "")

    if not (host and user and password):
        raise HTTPException(
            status_code=503,
            detail="Email is not configured on the server. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
        )

    analysis = _analysis_with_summary(db, current_user.id)
    pdf_bytes = build_pdf(analysis, username=current_user.username)

    rng = analysis.get("date_range")
    range_txt = f"{rng['from']} — {rng['to']}" if rng else "your account"
    summary = analysis.get("summary", {})
    bullets_html = "".join(f"<li>{b}</li>" for b in summary.get("bullets", [])[:6])

    msg = EmailMessage()
    msg["Subject"] = f"Your FinAI Financial Report ({range_txt})"
    msg["From"] = sender
    msg["To"] = recipient
    msg.set_content(
        f"{summary.get('headline', 'Here is your FinAI financial report.')}\n\n"
        "Your full report is attached as a PDF.\n\n— FinAI"
    )
    msg.add_alternative(
        f"""<div style="font-family:Arial,sans-serif;color:#0f172a">
        <h2 style="color:#3b82f6">⚡ FinAI — Financial Report</h2>
        <p style="font-size:15px"><strong>{summary.get('headline', '')}</strong></p>
        <p style="color:#475569">Period: {range_txt}</p>
        <ul style="color:#475569;font-size:14px">{bullets_html}</ul>
        <p style="color:#475569;font-size:14px">Your full report — tables, charts and recurring spending — is attached as a PDF.</p>
        <p style="color:#94a3b8;font-size:12px">Sent by FinAI</p>
        </div>""",
        subtype="html",
    )
    filename = f"FinAI-Report-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            server.login(user, password)
            server.send_message(msg)
    except Exception as e:
        print(f"Email send failed: {e}")
        raise HTTPException(status_code=502, detail=f"Could not send the email: {e}")

    return {"message": f"Report emailed to {recipient}", "to": recipient}


def build_pdf(analysis: dict, username: str = "") -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem,
    )
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.legends import Legend

    BRAND = colors.HexColor("#3b82f6")
    DARK = colors.HexColor("#0f172a")
    SLATE = colors.HexColor("#475569")
    LIGHT = colors.HexColor("#f1f5f9")
    GREEN = colors.HexColor("#10b981")
    RED = colors.HexColor("#ef4444")
    PALETTE = [colors.HexColor(c) for c in
               ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"]]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18 * mm, bottomMargin=16 * mm, leftMargin=16 * mm, rightMargin=16 * mm,
        title="FinAI Financial Report",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=22, textColor=DARK, spaceAfter=2))
    styles.add(ParagraphStyle("Sub", fontName="Helvetica", fontSize=9, textColor=SLATE, spaceAfter=12))
    styles.add(ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13, textColor=DARK, spaceBefore=16, spaceAfter=6))
    styles.add(ParagraphStyle("Body", fontName="Helvetica", fontSize=10, textColor=SLATE, leading=15, spaceAfter=6))
    styles.add(ParagraphStyle("Headline", fontName="Helvetica-Bold", fontSize=12, textColor=BRAND, leading=16, spaceAfter=8))
    styles.add(ParagraphStyle("BulletTxt", fontName="Helvetica", fontSize=10, textColor=SLATE, leading=14))
    styles.add(ParagraphStyle("Cell", fontName="Helvetica", fontSize=8.5, textColor=SLATE))
    styles.add(ParagraphStyle("CellR", fontName="Helvetica", fontSize=8.5, textColor=DARK, alignment=2))

    def rupee(v):
        return "Rs " + f"{v:,.0f}"

    story = []
    totals = analysis["totals"]
    rng = analysis["date_range"]
    range_txt = f"{rng['from']} — {rng['to']}" if rng else "No data yet"

    # ── Header ───────────────────────────────────────────
    story.append(Paragraph("⚡ FinAI — Financial Report", styles["H1"]))
    who = f"for {username}  •  " if username else ""
    story.append(Paragraph(f"{who}{range_txt}  •  Generated {analysis['generated_at']}", styles["Sub"]))

    # ── KPI strip ────────────────────────────────────────
    kpi = [[
        Paragraph("<b>Total Income</b><br/>" + rupee(totals["total_income"]), styles["Body"]),
        Paragraph("<b>Total Spent</b><br/>" + rupee(totals["total_expenses"]), styles["Body"]),
        Paragraph("<b>Net Savings</b><br/>" + rupee(totals["net"]), styles["Body"]),
        Paragraph("<b>Avg / Month</b><br/>" + rupee(totals["avg_monthly_expense"]), styles["Body"]),
    ]]
    kpi_tbl = Table(kpi, colWidths=[44 * mm] * 4)
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.white),
        ("INNERGRID", (0, 0), (-1, -1), 4, colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(kpi_tbl)

    # ── AI summary ───────────────────────────────────────
    summary = analysis.get("summary", {})
    story.append(Paragraph("Summary", styles["H2"]))
    if summary.get("headline"):
        story.append(Paragraph(summary["headline"], styles["Headline"]))
    for para in summary.get("paragraphs", []):
        story.append(Paragraph(para, styles["Body"]))
    if summary.get("bullets"):
        items = [ListItem(Paragraph(b, styles["BulletTxt"]), leftIndent=6) for b in summary["bullets"]]
        story.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=12))

    # ── Charts ───────────────────────────────────────────
    by_cat = analysis["by_category"]
    by_month = analysis["by_month"]
    if by_cat or by_month:
        story.append(Paragraph("Where your money goes", styles["H2"]))
        chart_row = []

        if by_cat:
            top = by_cat[:6]
            others = sum(c["total"] for c in by_cat[6:])
            data = [c["total"] for c in top] + ([others] if others else [])
            labels = [f"{c['category'].title()} {c['pct']:.0f}%" for c in top] + (["Other"] if others else [])
            d = Drawing(230, 160)
            pie = Pie()
            pie.x, pie.y, pie.width, pie.height = 10, 15, 120, 120
            pie.data = data
            pie.slices.strokeWidth = 0.5
            pie.slices.strokeColor = colors.white
            for i in range(len(data)):
                pie.slices[i].fillColor = PALETTE[i % len(PALETTE)]
            d.add(pie)
            legend = Legend()
            legend.x, legend.y = 140, 140
            legend.fontName = "Helvetica"
            legend.fontSize = 7
            legend.dxTextSpace = 4
            legend.deltay = 11
            legend.dy = 6
            legend.dx = 6
            legend.colorNamePairs = [
                (PALETTE[i % len(PALETTE)], labels[i]) for i in range(len(labels))
            ]
            d.add(legend)
            chart_row.append(d)

        if len(by_month) >= 2:
            recent = by_month[-6:]
            d2 = Drawing(250, 160)
            bc = VerticalBarChart()
            bc.x, bc.y, bc.width, bc.height = 30, 25, 200, 110
            bc.data = [[m["income"] for m in recent], [m["expenses"] for m in recent]]
            bc.categoryAxis.categoryNames = [m["label"].split(" ")[0] for m in recent]
            bc.categoryAxis.labels.fontSize = 7
            bc.valueAxis.labels.fontSize = 7
            bc.valueAxis.valueMin = 0
            bc.bars[0].fillColor = GREEN
            bc.bars[1].fillColor = RED
            bc.barSpacing = 1
            bc.groupSpacing = 8
            d2.add(bc)
            chart_row.append(d2)

        if chart_row:
            ct = Table([chart_row], colWidths=[90 * mm, 88 * mm][: len(chart_row)])
            ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
            story.append(ct)
            if len(by_month) >= 2:
                story.append(Paragraph(
                    "<font color='#10b981'>■</font> Income   "
                    "<font color='#ef4444'>■</font> Expenses  (last 6 months)",
                    styles["Cell"]))

    # ── Recurring table ──────────────────────────────────
    recurring = analysis["recurring"]
    if recurring:
        story.append(Paragraph("Recurring & repeated spending", styles["H2"]))
        head = ["Item", "Category", "Cadence", "Times", "Avg", "Total"]
        rows = [head]
        for r in recurring[:15]:
            rows.append([
                Paragraph(r["label"][:34], styles["Cell"]),
                Paragraph(r["category"].title(), styles["Cell"]),
                Paragraph(r["cadence"], styles["Cell"]),
                Paragraph(str(r["occurrences"]), styles["CellR"]),
                Paragraph(rupee(r["avg_amount"]), styles["CellR"]),
                Paragraph(rupee(r["total_amount"]), styles["CellR"]),
            ])
        t = Table(rows, colWidths=[46 * mm, 26 * mm, 30 * mm, 14 * mm, 24 * mm, 26 * mm], repeatRows=1)
        t.setStyle(_table_style(BRAND, LIGHT))
        story.append(t)

    # ── Category table ───────────────────────────────────
    if by_cat:
        story.append(Paragraph("Category breakdown", styles["H2"]))
        rows = [["Category", "Transactions", "% of spend", "Total"]]
        for c in by_cat:
            rows.append([
                Paragraph(c["category"].title(), styles["Cell"]),
                Paragraph(str(c["count"]), styles["CellR"]),
                Paragraph(f"{c['pct']:.1f}%", styles["CellR"]),
                Paragraph(rupee(c["total"]), styles["CellR"]),
            ])
        t = Table(rows, colWidths=[66 * mm, 34 * mm, 34 * mm, 32 * mm], repeatRows=1)
        t.setStyle(_table_style(BRAND, LIGHT))
        story.append(t)

    # ── Monthly table ────────────────────────────────────
    if by_month:
        story.append(Paragraph("Month-by-month", styles["H2"]))
        rows = [["Month", "Income", "Expenses", "Net", "Txns"]]
        for m in reversed(by_month):
            rows.append([
                Paragraph(m["label"], styles["Cell"]),
                Paragraph(rupee(m["income"]), styles["CellR"]),
                Paragraph(rupee(m["expenses"]), styles["CellR"]),
                Paragraph(rupee(m["net"]), styles["CellR"]),
                Paragraph(str(m["count"]), styles["CellR"]),
            ])
        t = Table(rows, colWidths=[40 * mm, 34 * mm, 34 * mm, 34 * mm, 24 * mm], repeatRows=1)
        t.setStyle(_table_style(BRAND, LIGHT))
        story.append(t)

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "Generated by FinAI • This report reflects all transactions recorded in your account.",
        styles["Cell"]))

    doc.build(story)
    return buf.getvalue()


def _table_style(brand, light):
    from reportlab.lib import colors
    from reportlab.platypus import TableStyle
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), brand),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("ALIGN", (1, 0), (-1, 0), "RIGHT"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, light]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ])
