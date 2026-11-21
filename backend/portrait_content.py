import json

PORTRAIT_CATEGORIES = {
    "temperament": "Темперамент",
    "personality": "Личность",
    "self-esteem": "Самооценка",
    "sociability": "Общительность",
    "career": "Профориентация",
}
REQUIRED_PORTRAIT_CATEGORIES = tuple(name for key, name in PORTRAIT_CATEGORIES.items() if key != "career")


def build_portrait(answer, test_groups):
    answer = answer.strip()
    if answer.startswith("```json\n") and answer.endswith("```"):
        answer = answer[8:-3].strip()
    interpretations = json.loads(answer)
    if not isinstance(interpretations, dict) or interpretations.keys() != test_groups.keys():
        raise ValueError("Unexpected portrait categories")

    sections = []
    progress_ids = {}
    markdown = []
    for key, category in PORTRAIT_CATEGORIES.items():
        tests = test_groups.get(key, [])
        lead = interpretation = ""
        if tests:
            block = interpretations[key]
            if not isinstance(block, dict) or block.keys() != {"lead", "interpretation"}:
                raise ValueError("Invalid portrait category")
            lead, interpretation = block["lead"], block["interpretation"]
            if (
                not isinstance(lead, str) or not 1 <= len(lead.strip()) <= 140
                or not isinstance(interpretation, str) or not 1 <= len(interpretation.strip()) <= 680
            ):
                raise ValueError("Invalid portrait text")
            lead = " ".join(lead.split())
            interpretation = " ".join(interpretation.split())
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
