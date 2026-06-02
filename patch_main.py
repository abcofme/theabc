import os
import re

def patch_file():
    filepath = r"c:\Users\marts\OneDrive\Desktop\abc\backend\api\main.py"
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add import asyncio at the top
    if "import asyncio" not in content:
        content = "import asyncio\n" + content

    # 2. Patch analyze-reaction
    # Replace the try block inside analyze_reaction
    try_analyze_rx = re.compile(
        r"(    try:\n        async with httpx\.AsyncClient\(timeout=\d+\.\d+\) as client:.*?return \{\"status\": \"success\", \"score\": score\}\n            \n    except Exception as e:\n.*?raise HTTPException\(status_code=500, detail=f\"Analysis failed: \{str\(e\)\}\"\))", 
        re.DOTALL
    )
    
    bg_analyze_code = """
async def _analyze_reaction_bg(user_id: int, entry_id: int, prompt: str, ai_url: str, ai_token: str):
    import re
    import httpx
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import DiaryEntry
    from sqlalchemy import select
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            ai_response = await client.post(
                ai_url,
                headers={
                    "Authorization": f"Bearer {ai_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-v4-flash-thinking",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            numbers = re.findall(r'\\d+', generated_text)
            score = max(0, min(100, int(numbers[0]))) if numbers else 50
            
            async with async_session() as db:
                entry = (await db.execute(select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id))).scalars().first()
                if entry:
                    entry.portrait_match_score = score
                    await db.commit()
            return {"status": "success", "score": score}
    except Exception as e:
        print("BG analyze failed:", e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/analyze-reaction/{entry_id}")"""

    if "@app.post(\"/api/analyze-reaction/{entry_id}\")" in content and "def _analyze_reaction_bg" not in content:
        content = content.replace('@app.post("/api/analyze-reaction/{entry_id}")', bg_analyze_code)
        
        # Replace the logic inside
        new_logic_analyze = """    task = asyncio.create_task(_analyze_reaction_bg(user_id, entry_id, prompt, ai_url, ai_token))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        raise"""
        content = try_analyze_rx.sub(new_logic_analyze, content)


    # 3. Patch portrait/generate
    try_portrait_rx = re.compile(
        r"(    try:\n        async with httpx\.AsyncClient\(timeout=\d+\.\d+\) as client:.*?return \{\"status\": \"success\", \"portrait\": new_portrait\}\n            \n    except Exception as e:\n.*?raise HTTPException\(status_code=500, detail=f\"Failed to generate portrait: \{str\(e\)\}\"\))",
        re.DOTALL
    )
    
    bg_portrait_code = """
async def _generate_portrait_bg(user_id: int, user_tests_count: int, prompt: str, ai_url: str, ai_token: str):
    import httpx
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import PersonalityPortrait
    from sqlalchemy import select
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json={
                    "model": "claude-4.8-opus",
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            
            if ai_response.status_code == 404:
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json={
                        "model": "claude-3-5-sonnet",
                        "messages": [{"role": "user", "content": prompt}]
                    }
                )

            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            async with async_session() as db:
                existing = (await db.execute(select(PersonalityPortrait).where(PersonalityPortrait.user_id == user_id))).scalars().first()
                if existing:
                    existing.content = generated_text
                    existing.tests_count = user_tests_count
                    new_portrait = existing
                else:
                    new_portrait = PersonalityPortrait(user_id=user_id, content=generated_text, tests_count=user_tests_count)
                    db.add(new_portrait)
                await db.commit()
                await db.refresh(new_portrait)
            return {"status": "success", "portrait": new_portrait}
    except Exception as e:
        print("BG portrait failed:", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate portrait: {str(e)}")

@app.post("/api/portrait/generate")"""

    if '@app.post("/api/portrait/generate")' in content and "def _generate_portrait_bg" not in content:
        content = content.replace('@app.post("/api/portrait/generate")', bg_portrait_code)
        
        new_logic_portrait = """    task = asyncio.create_task(_generate_portrait_bg(user_id, user_tests_count, prompt, ai_url, ai_token))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        raise"""
        content = try_portrait_rx.sub(new_logic_portrait, content)

    # 4. Patch reports/generate
    try_reports_rx = re.compile(
        r"(    try:\n        payload = \{.*?return \{\"status\": \"success\", \"report\": new_report\}\n            \n    except Exception as e:\n.*?raise HTTPException\(status_code=500, detail=f\"Failed to generate report: \{str\(e\)\}\"\))",
        re.DOTALL
    )
    
    bg_reports_code = """
async def _generate_report_bg(user_id: int, report_title: str, report_prompt: str, start_d, end_d, ai_url: str, ai_token: str, num_entries: int):
    import httpx
    from fastapi import HTTPException
    from backend.database import async_session
    from backend.database.models import BehavioralReport
    try:
        payload = {
            "model": "claude-4.8-opus",
            "messages": [{"role": "user", "content": report_prompt}]
        }
        print(f"--- Отправка запроса к ИИ ({payload['model']}) ---")
        print(f"URL: {ai_url}")
        print(f"Записей дневника передано: {num_entries}")
        print("-------------------------------------------------", flush=True)

        async with httpx.AsyncClient(timeout=None) as client:
            ai_response = await client.post(
                ai_url,
                headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                json=payload
            )
            
            if ai_response.status_code == 404:
                payload["model"] = "claude-3-5-sonnet"
                ai_response = await client.post(
                    ai_url,
                    headers={"Authorization": f"Bearer {ai_token}", "Content-Type": "application/json"},
                    json=payload
                )

            ai_response.raise_for_status()
            ai_data = ai_response.json()
            generated_text = ai_data["choices"][0]["message"]["content"].strip()
            
            async with async_session() as db:
                new_report = BehavioralReport(
                    user_id=user_id,
                    title=report_title,
                    period_start=start_d,
                    period_end=end_d,
                    content=generated_text
                )
                db.add(new_report)
                await db.commit()
                await db.refresh(new_report)
            return {"status": "success", "report": new_report}
    except Exception as e:
        print("BG report failed:", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.post("/api/reports/generate")"""

    if '@app.post("/api/reports/generate")' in content and "def _generate_report_bg" not in content:
        content = content.replace('@app.post("/api/reports/generate")', bg_reports_code)
        
        new_logic_reports = """    task = asyncio.create_task(_generate_report_bg(user_id, report_title, report_prompt, start_d, end_d, ai_url, ai_token, len(entries)))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        raise"""
        content = try_reports_rx.sub(new_logic_reports, content)


    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched main.py successfully.")

if __name__ == "__main__":
    patch_file()
