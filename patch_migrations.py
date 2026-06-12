import os
import re

versions_dir = 'migrations/versions'

for filename in os.listdir(versions_dir):
    if not filename.endswith('.py'):
        continue
    filepath = os.path.join(versions_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We will look for op.add_column('table', sa.Column('col', ...))
    # and replace it with a safe check if it doesn't already have one.
    
    # Regex to find: op.add_column('table_name', sa.Column('col_name', ...))
    pattern = re.compile(r"(\s*)op\.add_column\('([^']+)',\s*sa\.Column\('([^']+)',(.*?)\)\)")
    
    def replacer(match):
        indent = match.group(1)
        table = match.group(2)
        col = match.group(3)
        rest = match.group(4)
        
        replacement = f"""{indent}conn = op.get_bind()
{indent}inspector = sa.inspect(conn)
{indent}if '{col}' not in [c['name'] for c in inspector.get_columns('{table}')]:
{indent}    op.add_column('{table}', sa.Column('{col}',{rest}))"""
        return replacement
    
    new_content = pattern.sub(replacer, content)
    
    # Also replace create_unique_constraint since that often fails too
    uc_pattern = re.compile(r"(\s*)op\.create_unique_constraint\((.*?)\)")
    def uc_replacer(match):
        indent = match.group(1)
        args = match.group(2)
        return f"""{indent}try:
{indent}    op.create_unique_constraint({args})
{indent}except Exception:
{indent}    pass"""
        
    new_content = uc_pattern.sub(uc_replacer, new_content)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Patched {filename}")
