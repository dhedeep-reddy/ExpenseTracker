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


# Categories that are typically committed / compulsory (fixed costs).
# Matched as substrings against the category name, case-insensitive.
COMPULSORY_KEYWORDS = (
    "rent", "recharge", "mobile", "phone", "electric", "water", "internet", "wifi",
    "broadband", "utilit", "subscription", "subscribe", "loan", "emi", "insurance",
    "fee", "maintenance", "gas", "dth", "bill", "tuition", "rion", "premium",
)


def _is_compulsory(category: str) -> bool:
    c = (category or "").lower()
    return any(k in c for k in COMPULSORY_KEYWORDS)


def build_analysis(db: Session, user_id: int, months: Optional[List[str]] = None) -> dict:
    """Compute the full report. If `months` (list of "YYYY-MM") is given, the
    analysis is scoped to only those months; otherwise it covers everything.
    `available_months` always lists every month with data so the UI can offer
    a picker regardless of the current selection."""
    user_cycle_ids = [c.id for c in db.query(Cycle).filter(Cycle.user_id == user_id).all()]
    all_txs = (
        db.query(Transaction).filter(Transaction.cycle_id.in_(user_cycle_ids)).all()
        if user_cycle_ids else []
    )

    # Every month that has data — for the selector (independent of filter).
    all_month_keys = sorted({t.date.strftime("%Y-%m") for t in all_txs})
    available_months = [
        {"month": k, "label": datetime.strptime(k, "%Y-%m").strftime("%b %Y")}
        for k in all_month_keys
    ]

    # Apply the month filter.
    selected = [m for m in (months or []) if m]
    if selected:
        sel_set = set(selected)
        txs = [t for t in all_txs if t.date.strftime("%Y-%m") in sel_set]
    else:
        txs = all_txs
    selected_labels = [
        datetime.strptime(k, "%Y-%m").strftime("%b %Y")
        for k in sorted({t.date.strftime("%Y-%m") for t in txs})
    ]

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
    scoped_month_keys = [m["month"] for m in by_month]
    scoped_month_labels = [m["label"] for m in by_month]

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
                "compulsory": _is_compulsory(cat),
            }
            for cat, v in cat_totals.items()
        ],
        key=lambda x: x["total"], reverse=True,
    )

    # ── Category × month comparison matrix (expenses) ────
    # {category: {month_key: total}}  → list with per-month amounts + delta
    cat_month = defaultdict(lambda: defaultdict(float))
    for t in expense_txs:
        cat_month[(t.category or "other").lower()][t.date.strftime("%Y-%m")] += t.amount

    category_by_month = []
    for cat in sorted(cat_month.keys(), key=lambda c: -sum(cat_month[c].values())):
        per_month = {mk: round(cat_month[cat].get(mk, 0.0), 2) for mk in scoped_month_keys}
        vals = [per_month[mk] for mk in scoped_month_keys]
        delta = round(vals[-1] - vals[0], 2) if len(vals) >= 2 else 0.0
        category_by_month.append({
            "category": cat,
            "compulsory": _is_compulsory(cat),
            "per_month": per_month,
            "total": round(sum(vals), 2),
            "delta_first_to_last": delta,
        })

    # ── Fixed / compulsory vs discretionary split ────────
    fixed_total = sum(c["total"] for c in by_category if c["compulsory"])
    variable_total = sum(c["total"] for c in by_category if not c["compulsory"])
    fixed_vs_variable = {
        "fixed_total": round(fixed_total, 2),
        "variable_total": round(variable_total, 2),
        "fixed_pct": round((fixed_total / total_expenses * 100) if total_expenses else 0, 1),
        "variable_pct": round((variable_total / total_expenses * 100) if total_expenses else 0, 1),
        "fixed_categories": [c["category"] for c in by_category if c["compulsory"]],
        "variable_categories": [c["category"] for c in by_category if not c["compulsory"]],
    }

    # ── Recurring detection ──────────────────────────────
    # Group expenses by (category, normalized description). Recurring if it
    # spans 2+ months OR repeats 3+ times within the scope.
    groups = defaultdict(list)
    for t in expense_txs:
        desc = _normalize(t.description)
        cat = (t.category or "other").lower()
        key = (cat, desc) if desc else (cat, "")
        groups[key].append(t)

    recurring = []
    for (cat, desc), items in groups.items():
        months_seen = {t.date.strftime("%Y-%m") for t in items}
        if len(months_seen) < 2 and len(items) < 3:
            continue
        amounts = [t.amount for t in items]
        dates = [t.date for t in items]
        last = max(items, key=lambda t: t.date)
        label = (desc.title() if desc else cat.title())
        recurring.append({
            "label": label,
            "category": cat,
            "description": desc,
            "compulsory": _is_compulsory(cat),
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

    # ── Full line-item ledger for the selected months ────
    transactions = [
        {
            "date": t.date.strftime("%Y-%m-%d"),
            "month": t.date.strftime("%Y-%m"),
            "type": t.type.value,
            "category": (t.category or "—"),
            "description": t.description or "",
            "amount": round(t.amount, 2),
        }
        for t in sorted(txs, key=lambda x: x.date)
    ]

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "date_range": date_range,
        "available_months": available_months,
        "selected_months": scoped_month_keys,
        "selected_labels": scoped_month_labels,
        "totals": totals,
        "by_month": by_month,
        "by_category": by_category,
        "category_by_month": category_by_month,
        "fixed_vs_variable": fixed_vs_variable,
        "recurring": recurring,
        "transactions": transactions,
    }


# ──────────────────────────────────────────────────────────────
#  JSON endpoint (drives the on-screen report)
# ──────────────────────────────────────────────────────────────

def _parse_months(months: Optional[str]) -> Optional[List[str]]:
    """Turn a comma-separated 'YYYY-MM,YYYY-MM' query param into a list."""
    if not months:
        return None
    return [m.strip() for m in months.split(",") if m.strip()]


def _analysis_with_summary(db: Session, user_id: int, months: Optional[List[str]] = None) -> dict:
    """Build the full analysis and attach the AI narrative summary."""
    analysis = build_analysis(db, user_id, months=months)
    # Give the model a focused, number-rich view.
    stats_for_ai = {
        "selected_months": analysis["selected_labels"],
        "totals": analysis["totals"],
        "date_range": analysis["date_range"],
        "by_category": analysis["by_category"][:10],
        "fixed_vs_variable": analysis["fixed_vs_variable"],
        "category_by_month": analysis["category_by_month"][:10],
        "recurring": analysis["recurring"][:12],
        "by_month": analysis["by_month"],
    }
    analysis["summary"] = generate_report_summary(stats_for_ai)
    return analysis


@router.get("/analysis")
def get_analysis(
    months: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _analysis_with_summary(db, current_user.id, months=_parse_months(months))


# ──────────────────────────────────────────────────────────────
#  PDF export
# ──────────────────────────────────────────────────────────────

@router.get("/pdf")
def get_pdf(
    months: Optional[str] = None,
    sections: str = "full",
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    analysis = _analysis_with_summary(db, current_user.id, months=_parse_months(months))
    pdf_bytes = build_pdf(analysis, username=current_user.username, sections=sections)
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
    months: Optional[List[str]] = None
    sections: str = "full"


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

    analysis = _analysis_with_summary(db, current_user.id, months=body.months)
    pdf_bytes = build_pdf(analysis, username=current_user.username, sections=body.sections or "full")

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


def build_pdf(analysis: dict, username: str = "", sections: str = "full") -> bytes:
    # sections: "full" (everything), "analysis" (no line-item ledger),
    # or "transactions" (statement: KPIs + monthly + full ledger only).
    show_narrative = sections in ("full", "analysis")
    show_ledger = sections in ("full", "transactions")

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem, PageBreak,
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
    sel_labels = analysis.get("selected_labels", [])
    avail = analysis.get("available_months", [])
    if sel_labels and len(sel_labels) < len(avail):
        scope_txt = "Months: " + ", ".join(sel_labels)
    else:
        scope_txt = f"All months ({range_txt})"
    story.append(Paragraph(f"{who}{scope_txt}  •  Generated {analysis['generated_at']}", styles["Sub"]))

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

    # ── Fixed vs Discretionary ───────────────────────────
    fv = analysis.get("fixed_vs_variable")
    if fv and totals["total_expenses"]:
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            f"<b>Committed / fixed costs:</b> {rupee(fv['fixed_total'])} "
            f"({fv['fixed_pct']:.0f}%)  &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"<b>Discretionary:</b> {rupee(fv['variable_total'])} ({fv['variable_pct']:.0f}%)",
            styles["Body"]))

    # ── AI summary ───────────────────────────────────────
    summary = analysis.get("summary", {})
    if show_narrative:
        story.append(Paragraph("Summary", styles["H2"]))
    if show_narrative and summary.get("headline"):
        story.append(Paragraph(summary["headline"], styles["Headline"]))
    if show_narrative:
        for para in summary.get("paragraphs", []):
            story.append(Paragraph(para, styles["Body"]))
        if summary.get("bullets"):
            items = [ListItem(Paragraph(b, styles["BulletTxt"]), leftIndent=6) for b in summary["bullets"]]
            story.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=12))

    # ── Charts ───────────────────────────────────────────
    by_cat = analysis["by_category"]
    by_month = analysis["by_month"]
    if show_narrative and (by_cat or by_month):
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
    if show_narrative and recurring:
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
    if show_narrative and by_cat:
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

    # ── Category × month comparison (only if 2+ months) ──
    cbm = analysis.get("category_by_month", [])
    month_labels = analysis.get("selected_labels", [])
    if show_narrative and cbm and len(month_labels) >= 2:
        story.append(Paragraph("Category by month", styles["H2"]))
        month_keys = analysis["selected_months"]
        head = ["Category"] + month_labels + ["Total"]
        rows = [head]
        for c in cbm[:16]:
            row = [Paragraph(("● " if c["compulsory"] else "") + c["category"].title(), styles["Cell"])]
            for mk in month_keys:
                row.append(Paragraph(rupee(c["per_month"].get(mk, 0)), styles["CellR"]))
            row.append(Paragraph(rupee(c["total"]), styles["CellR"]))
            rows.append(row)
        # Fit columns to page width (~178mm usable)
        first_col = 40
        rest = (178 - first_col) / (len(month_labels) + 1)
        widths = [first_col * mm] + [rest * mm] * (len(month_labels) + 1)
        t = Table(rows, colWidths=widths, repeatRows=1)
        t.setStyle(_table_style(BRAND, LIGHT))
        story.append(t)
        story.append(Paragraph("● = committed / fixed cost", styles["Cell"]))

    # ── Full transactions ledger (grouped by month) ─────
    transactions = analysis.get("transactions", [])
    if show_ledger and transactions:
        if show_narrative:
            story.append(PageBreak())
        story.append(Paragraph("Transactions", styles["H2"]))
        by_m = defaultdict(list)
        for tx in transactions:
            by_m[tx["month"]].append(tx)
        for mk in sorted(by_m.keys()):
            label = datetime.strptime(mk, "%Y-%m").strftime("%b %Y")
            month_txs = by_m[mk]
            spent = sum(x["amount"] for x in month_txs if x["type"] == "EXPENSE")
            story.append(Paragraph(f"{label} — {len(month_txs)} entries, spent {rupee(spent)}", styles["Headline"]))
            rows = [["Date", "Category", "Description", "Type", "Amount"]]
            for tx in month_txs:
                rows.append([
                    Paragraph(tx["date"], styles["Cell"]),
                    Paragraph(tx["category"].title(), styles["Cell"]),
                    Paragraph((tx["description"] or "—")[:40], styles["Cell"]),
                    Paragraph(tx["type"].title(), styles["Cell"]),
                    Paragraph(("- " if tx["type"] == "EXPENSE" else "+ ") + rupee(tx["amount"]), styles["CellR"]),
                ])
            t = Table(rows, colWidths=[22 * mm, 30 * mm, 62 * mm, 24 * mm, 30 * mm], repeatRows=1)
            t.setStyle(_table_style(BRAND, LIGHT))
            story.append(t)
            story.append(Spacer(1, 5 * mm))

    story.append(Spacer(1, 8 * mm))
    scope_note = ("selected months" if sel_labels and len(sel_labels) < len(avail) else "all recorded months")
    story.append(Paragraph(
        f"Generated by FinAI • This report reflects {scope_note}.",
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
