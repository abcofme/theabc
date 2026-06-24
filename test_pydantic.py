from pydantic import BaseModel
try:
    from pydantic import constr
except ImportError:
    pass

class M(BaseModel):
    name: str

try:
    M(name=123)
except Exception as e:
    print(repr(e))
    if hasattr(e, "errors"):
        print(e.errors())
