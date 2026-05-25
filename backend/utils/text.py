def upcase_first_letter(s: str) -> str:
    return s[0].upper() + s[1:]


def question_mark(s: str) -> str:
    if s[-1] == '.' and s[-2] == '?':
        return s[0:-1]
    else:
        return s
