import hashlib
import hmac
import json
import urllib.parse
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader
from settings import settings

# Ожидаем токен в заголовке Authorization
header_scheme = APIKeyHeader(name="Authorization")

def validate_twa_data(auth_header: str = Security(header_scheme)) -> dict:
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")
    
    init_data = auth_header.replace("Bearer ", "")
    parsed_data = dict(urllib.parse.parse_qsl(init_data))
    
    if "hash" not in parsed_data:
        raise HTTPException(status_code=401, detail="No hash in initData")
    
    hash_ = parsed_data.pop("hash")
    # Сортируем ключи и создаем строку для проверки
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
    
    # Хэшируем с помощью токена бота
    secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    
    if calculated_hash != hash_:
        raise HTTPException(status_code=401, detail="Invalid initData hash")
    
    # Возвращаем данные пользователя (id, username и т.д.)
    user_data = json.loads(parsed_data.get("user", "{}"))
    if "start_param" in parsed_data:
        user_data["start_param"] = parsed_data["start_param"]
    return user_data