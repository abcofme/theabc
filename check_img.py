import os
import sys

path = r'c:\abc\theabc\backend\resources\images\личность.png'
if not os.path.exists(path):
    print('Not found')
    sys.exit()
with open(path, 'rb') as f:
    header = f.read(8)
    print(' '.join(f'{b:02x}' for b in header))
