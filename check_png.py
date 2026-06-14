import os
import struct

path = r'c:\abc\theabc\backend\resources\images\личность.png'
with open(path, 'rb') as f:
    f.read(8)
    while True:
        length_bytes = f.read(4)
        if not length_bytes: break
        length = struct.unpack('>I', length_bytes)[0]
        chunk_type = f.read(4).decode('ascii')
        if chunk_type == 'IHDR':
            data = f.read(length)
            w, h, bit_depth, color_type, comp, filter, interlace = struct.unpack('>IIBBBBB', data)
            print(f'Width: {w}, Height: {h}, BitDepth: {bit_depth}, ColorType: {color_type}')
            break
        else:
            f.read(length + 4)
