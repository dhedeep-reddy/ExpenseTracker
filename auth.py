from werkzeug.security import generate_password_hash, check_password_hash
from database import User

def register_user(db_session, username, password):
    existing_user = db_session.query(User).filter_by(username=username).first()
    if existing_user:
        return False, "Username already exists."
    
    password_hash = generate_password_hash(password)
    new_user = User(username=username, password_hash=password_hash)
    db_session.add(new_user)
    db_session.commit()
    return True, "User registered successfully."

def verify_user(db_session, username, password):
    user = db_session.query(User).filter_by(username=username).first()
    if not user:
        return False, "Invalid username or password."
    
    if check_password_hash(user.password_hash, password):
        return True, user
    return False, "Invalid username or password."
