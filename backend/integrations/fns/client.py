import datetime
import httpx
from loguru import logger

class FNSClient:
    API_URL = "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status"
    
    @classmethod
    async def check_self_employed(cls, inn: str) -> bool:
        """
        Проверяет статус самозанятого (НПД) в официальном открытом API ФНС.
        Возвращает True, если человек зарегистрирован как самозанятый.
        """
        if not inn or not str(inn).isdigit() or len(str(inn)) not in (10, 12):
            return False
            
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "inn": str(inn),
            "requestDate": today
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(cls.API_URL, json=payload, timeout=10.0)
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get("status", False)
                else:
                    logger.error(f"FNS API error: {response.status_code} {response.text}")
                    return False
        except Exception as e:
            logger.error(f"FNS API connection error: {e}")
            return False
