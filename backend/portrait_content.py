import json

PORTRAIT_CATEGORIES = {
    "temperament": "Темперамент",
    "personality": "Личность",
    "self-esteem": "Самооценка",
    "sociability": "Общительность",
    "career": "Профориентация",
}


def parse_portrait_block(answer):
    if not isinstance(answer, str) or "{" not in answer:
        raise ValueError("Portrait response has no JSON object")
    # Провайдер иногда оборачивает JSON в Markdown или предваряет его пояснением.
    start = answer.index("{")
    block, _ = json.JSONDecoder().raw_decode(answer, start)
    if not isinstance(block, dict) or block.keys() != {"lead", "interpretation"}:
        raise ValueError("Invalid portrait category")
    lead, interpretation = block["lead"], block["interpretation"]
    if (
        not isinstance(lead, str) or not 1 <= len(lead.strip()) <= 140
        or not isinstance(interpretation, str) or not 1 <= len(interpretation.strip()) <= 680
    ):
        raise ValueError("Invalid portrait text")
    return " ".join(lead.split()), " ".join(interpretation.split())


def build_portrait(interpretations, test_groups):
    sections = []
    progress_ids = {}
    markdown = []
    for key, tests in test_groups.items():
        category = PORTRAIT_CATEGORIES.get(key) or tests[0].category
        lead = interpretation = ""
        if tests:
            lead, interpretation = interpretations[key]
            markdown.append(f"## {category}\n\n**{lead}**\n\n{interpretation}")
            progress_ids.update({str(result.test_id): result.progress_id for result in tests})
        sections.append({
            "key": key,
            "category": category,
            "lead": lead,
            "interpretation": interpretation,
            "test_count": len(tests),
        })

    metadata = {"version": 1, "sections": sections, "progress_ids": progress_ids}
    return "\n\n".join(markdown), json.dumps(metadata, ensure_ascii=False)


def read_portrait_metadata(technical_summary):
    try:
        metadata = json.loads(technical_summary or "null")
    except ValueError:
        return None
    if (
        isinstance(metadata, dict) and metadata.get("version") == 1
        and isinstance(metadata.get("sections"), list)
        and isinstance(metadata.get("progress_ids"), dict)
    ):
        return metadata
    return None
