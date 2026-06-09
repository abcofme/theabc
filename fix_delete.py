import os
import re

main_py_path = r'C:\abc\theabc\backend\api\main.py'
with open(main_py_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """    test = await session.get(Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
        
    await session.delete(test)
    await session.commit()"""

new_code = """    test = await session.get(Test, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
        
    from sqlalchemy import delete
    from backend.database.models import Progress, Result
    await session.execute(delete(Progress).where(Progress.test_id == test_id))
    await session.execute(delete(Result).where(Result.test_id == test_id))
        
    await session.delete(test)
    await session.commit()"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(main_py_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patch applied to main.py")
else:
    print("Could not find the target code block in main.py")
