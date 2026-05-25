def split_string(text: str, limit: int = 4095) -> list[str]:
    if len(text) <= limit:
        return [text]

    split_strings = []
    start = 0
    while start < len(text):
        end = min(start + limit, len(text))
        split_strings.append(text[start:end])
        start = end

    return split_strings
