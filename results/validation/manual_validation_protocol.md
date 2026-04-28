# Manual Label Validation Protocol

1. Read `first_prompt`, `last_prompt`, and `last_answer` for each row.
2. Assign `human_success` as `1` (successful) or `0` (unsuccessful).
3. Enter confidence in `human_confidence` as `high`, `medium`, or `low`.
4. Use `review_notes` for ambiguous decisions.
5. Keep `auto_success` unchanged to preserve reproducibility.

Decision guidance:
- Mark successful when the final assistant response appears to solve the user's coding request based on text evidence.
- Mark unsuccessful when the conversation indicates unresolved errors, mismatch, or absent useful code.
- If insufficient evidence exists, leave `human_success` blank and note ambiguity.