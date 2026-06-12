import os
import re

versions_dir = 'migrations/versions'

for filename in os.listdir(versions_dir):
    if not filename.endswith('.py'):
        continue
    filepath = os.path.join(versions_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove the bad try..except blocks I added for create_unique_constraint
    # It looks like:
    # try:
    #     op.create_unique_constraint(None, 'answers', ['id'])
    # except Exception:
    #     pass
    
    bad_try_pattern = re.compile(r"(\s*)try:\s*\n(\s*)op\.create_unique_constraint\((.*?)\)\s*\n\s*except Exception:\s*\n\s*pass", re.DOTALL)
    
    def replacer(match):
        indent = match.group(1)
        args = match.group(3)
        parts = [p.strip() for p in args.split(',')]
        if len(parts) >= 2:
            table = parts[1].strip("'")
            return f"""{indent}conn = op.get_bind()
{indent}res = conn.execute(sa.text("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = '{table}' AND constraint_type = 'UNIQUE'"))
{indent}if not res.fetchall():
{indent}    op.create_unique_constraint({args})"""
        return f"{indent}op.create_unique_constraint({args})"
        
    new_content = bad_try_pattern.sub(replacer, content)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Patched {filename} constraints")
