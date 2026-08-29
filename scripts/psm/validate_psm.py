#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SLICE_STATUSES = {"planned", "ready", "active", "blocked", "done"}
READY_SLICE_STATUSES = {"ready", "active", "blocked", "done"}
MILESTONE_STATUSES = {"planned", "active", "passed"}
INBOX_STATUSES = {"untriaged", "triaged"}
BACKLOG_STATUSES = {"candidate", "selected", "dropped"}
NONE_MARKERS = {"", "-", "--", "—", "none", "n/a"}


class Issue:
    def __init__(self, message: str, path: Path | None = None) -> None:
        self.message = message
        self.path = path


class RoadmapEntry:
    def __init__(
        self,
        id: str,
        title: str,
        outcome: str,
        boundary: str,
        status: str,
        depends_on: list[str],
        milestone: str | None,
        spec_path: Path | None,
        row_number: int,
    ) -> None:
        self.id = id
        self.title = title
        self.outcome = outcome
        self.boundary = boundary
        self.status = status
        self.depends_on = depends_on
        self.milestone = milestone
        self.spec_path = spec_path
        self.row_number = row_number


class Milestone:
    def __init__(self, id: str, status: str, slices: list[str], path: Path, body: str) -> None:
        self.id = id
        self.status = status
        self.slices = slices
        self.path = path
        self.body = body


class TaskEntry:
    def __init__(self, id: str, implements: list[str], depends_on: list[str]) -> None:
        self.id = id
        self.implements = implements
        self.depends_on = depends_on


class SlicePackage:
    def __init__(
        self,
        entry: RoadmapEntry,
        capabilities: list[str],
        requirements: dict[str, Path],
        tasks: dict[str, TaskEntry],
        verification_evidence: str,
        reconciliation_notes: str,
    ) -> None:
        self.entry = entry
        self.capabilities = capabilities
        self.requirements = requirements
        self.tasks = tasks
        self.verification_evidence = verification_evidence
        self.reconciliation_notes = reconciliation_notes


class Validator:
    def __init__(self, target: Path, strict: bool = False) -> None:
        self.repo_root, self.planning_root = resolve_roots(target)
        self.strict = strict
        self.project_title = self.repo_root.name
        self.issues: list[Issue] = []
        self.roadmap_entries: dict[str, RoadmapEntry] = {}
        self.milestones: dict[str, Milestone] = {}
        self.slice_packages: dict[str, SlicePackage] = {}
        self.spec_ids: dict[str, Path] = {}
        self.requirement_ids: dict[str, Path] = {}
        self.task_ids: dict[str, Path] = {}

    def run(self) -> bool:
        self.validate_core_contract()
        self.load_roadmap()
        self.load_milestones()
        self.validate_roadmap()
        self.validate_slice_packages()
        self.validate_milestones()
        self.validate_supporting_artifacts()
        self.validate_links()
        return not self.issues

    def error(self, message: str, path: Path | None = None) -> None:
        self.issues.append(Issue(message=message, path=path))

    def read_markdown(self, path: Path) -> tuple[dict[str, object], str]:
        try:
            return read_markdown_file(path)
        except ValueError as error:
            self.error(f"invalid frontmatter: {error}", path)
            try:
                return {}, path.read_text(encoding="utf-8")
            except OSError:
                return {}, ""

    def validate_core_contract(self) -> None:
        if not self.planning_root.exists():
            self.error("planning/ directory is missing", self.repo_root)
            return

        for required in ["PROJECT.md", "ROADMAP.md", "INBOX.md"]:
            target = self.planning_root / required
            if not target.exists():
                self.error(f"missing required planning artifact: {required}", target)

        project_path = self.planning_root / "PROJECT.md"
        if project_path.exists():
            self.project_title = extract_first_heading(project_path.read_text(encoding="utf-8")) or self.repo_root.name

        specs_root = self.planning_root / "specs"
        if not specs_root.exists():
            self.error("missing required planning artifact: specs/", specs_root)

    def load_roadmap(self) -> None:
        roadmap_path = self.planning_root / "ROADMAP.md"
        if not roadmap_path.exists():
            return

        try:
            rows = parse_markdown_table(roadmap_path)
        except ValueError as error:
            self.error(str(error), roadmap_path)
            return

        required_columns = {"id", "dependson", "milestone", "status", "spec"}
        if not required_columns.issubset(rows["headers"].keys()):
            self.error("ROADMAP.md is missing one or more required table columns: ID, Depends On, Milestone, Status, Spec", roadmap_path)
            return

        for row_number, row in rows["rows"]:
            row_id = row.get("id", "").strip()
            if not row_id:
                self.error(f"roadmap row {row_number} is missing a slice ID", roadmap_path)
                continue
            if row_id in self.roadmap_entries:
                self.error(f"duplicate roadmap slice ID: {row_id}", roadmap_path)
                continue

            status = canonical_slice_status(row.get("status", "").strip())
            if status not in SLICE_STATUSES:
                self.error(f"invalid roadmap slice status '{row.get('status', '').strip()}' for {row_id}", roadmap_path)

            depends_on = parse_csv_list(row.get("dependson", ""), row_id, "S")
            milestone = normalize_cell_value(row.get("milestone", ""))
            spec_cell = normalize_cell_value(row.get("spec", ""))
            spec_path = self.planning_root / spec_cell if spec_cell else None

            self.roadmap_entries[row_id] = RoadmapEntry(
                id=row_id,
                title=row.get("slice", "").strip(),
                outcome=row.get("outcome", "").strip(),
                boundary=row.get("boundary", "").strip(),
                status=status,
                depends_on=depends_on,
                milestone=milestone,
                spec_path=spec_path,
                row_number=row_number,
            )

    def load_milestones(self) -> None:
        milestones_root = self.planning_root / "milestones"
        if not milestones_root.exists():
            return

        for path in sorted(milestones_root.rglob("*.md")):
            metadata, body = self.read_markdown(path)
            milestone_id = metadata.get("id")
            if not milestone_id:
                if path.name != "README.md":
                    self.error("milestone file is missing frontmatter id", path)
                continue

            if milestone_id in self.milestones:
                self.error(f"duplicate milestone ID: {milestone_id}", path)
                continue

            status = str(metadata.get("status", "")).strip()
            if status not in MILESTONE_STATUSES:
                self.error(f"invalid milestone status '{status}' for {milestone_id}", path)

            if metadata.get("type") not in {None, "milestone"}:
                self.error(f"invalid milestone type '{metadata.get('type')}' for {milestone_id}", path)

            slices = metadata.get("slices", [])
            if not isinstance(slices, list):
                self.error(f"milestone {milestone_id} slices field must be a list", path)
                slices = []

            self.milestones[milestone_id] = Milestone(
                id=milestone_id,
                status=status,
                slices=[str(item) for item in slices],
                path=path,
                body=body,
            )

    def validate_roadmap(self) -> None:
        if not self.roadmap_entries:
            return

        for entry in self.roadmap_entries.values():
            for dependency in entry.depends_on:
                if dependency == entry.id:
                    self.error(f"slice {entry.id} cannot depend on itself", self.planning_root / "ROADMAP.md")
                if dependency not in self.roadmap_entries:
                    self.error(f"slice {entry.id} depends on unknown slice {dependency}", self.planning_root / "ROADMAP.md")

            if entry.milestone and entry.milestone not in self.milestones:
                self.error(f"slice {entry.id} references unknown milestone {entry.milestone}", self.planning_root / "ROADMAP.md")

            if entry.status in READY_SLICE_STATUSES and entry.spec_path is None:
                self.error(f"slice {entry.id} is {entry.status} but has no linked spec", self.planning_root / "ROADMAP.md")

            if entry.spec_path and not entry.spec_path.exists():
                self.error(f"slice {entry.id} links missing spec file {entry.spec_path.relative_to(self.planning_root)}", self.planning_root / "ROADMAP.md")

        self.detect_dependency_cycles()

    def detect_dependency_cycles(self) -> None:
        visited: set[str] = set()
        visiting: list[str] = []

        def visit(node: str) -> None:
            if node in visiting:
                cycle = visiting[visiting.index(node):] + [node]
                self.error(f"dependency cycle detected: {' -> '.join(cycle)}", self.planning_root / "ROADMAP.md")
                return

            if node in visited:
                return

            visiting.append(node)
            for dependency in self.roadmap_entries[node].depends_on:
                if dependency in self.roadmap_entries:
                    visit(dependency)
            visiting.pop()
            visited.add(node)

        for node in self.roadmap_entries:
            visit(node)

    def validate_slice_packages(self) -> None:
        for entry in self.roadmap_entries.values():
            if not entry.spec_path or not entry.spec_path.exists():
                continue

            metadata, body = self.read_markdown(entry.spec_path)
            spec_id = str(metadata.get("id", "")).strip()
            if not spec_id:
                self.error(f"spec is missing frontmatter id for {entry.id}", entry.spec_path)
                continue

            if spec_id in self.spec_ids and self.spec_ids[spec_id] != entry.spec_path:
                self.error(f"duplicate spec ID: {spec_id}", entry.spec_path)
            else:
                self.spec_ids[spec_id] = entry.spec_path

            if spec_id != entry.id:
                self.error(f"spec ID {spec_id} does not match roadmap slice ID {entry.id}", entry.spec_path)

            if metadata.get("type") not in {None, "slice-spec"}:
                self.error(f"invalid spec type '{metadata.get('type')}' for {entry.id}", entry.spec_path)

            spec_status = canonical_slice_status(str(metadata.get("status", entry.status)).strip())
            if spec_status not in SLICE_STATUSES:
                self.error(f"invalid spec status '{metadata.get('status')}' for {entry.id}", entry.spec_path)
            if spec_status != entry.status:
                self.error(f"spec status {spec_status} does not match roadmap status {entry.status} for {entry.id}", entry.spec_path)

            milestone = str(metadata.get("milestone", "")).strip()
            if milestone and entry.milestone and milestone != entry.milestone:
                self.error(f"spec milestone {milestone} does not match roadmap milestone {entry.milestone} for {entry.id}", entry.spec_path)

            depends_on = metadata.get("depends_on", [])
            if isinstance(depends_on, list):
                normalized_depends_on = [str(item) for item in depends_on]
                if sorted(normalized_depends_on) != sorted(entry.depends_on):
                    self.error(f"spec depends_on does not match roadmap dependencies for {entry.id}", entry.spec_path)

            capabilities = metadata.get("capabilities", [])
            if not isinstance(capabilities, list):
                self.error(f"capabilities field must be a list for {entry.id}", entry.spec_path)
                capabilities = []

            if entry.status in READY_SLICE_STATUSES:
                for section in ["Outcome", "Scope", "Acceptance Criteria", "Demonstration"]:
                    if not has_section(body, section):
                        self.error(f"slice {entry.id} is {entry.status} but spec.md is missing section '{section}'", entry.spec_path)

            requirements = parse_requirement_ids(body, entry.id)
            for requirement_id in requirements:
                previous = self.requirement_ids.get(requirement_id)
                if previous and previous != entry.spec_path:
                    self.error(f"duplicate requirement ID: {requirement_id}", entry.spec_path)
                else:
                    self.requirement_ids[requirement_id] = entry.spec_path

            tasks_path = entry.spec_path.with_name("tasks.md")
            tasks: dict[str, TaskEntry] = {}
            verification_evidence = ""
            reconciliation_notes = ""

            if tasks_path.exists():
                tasks, verification_evidence, reconciliation_notes = self.parse_tasks_file(tasks_path, entry.id)
                for task in tasks.values():
                    for requirement in task.implements:
                        if requirement not in requirements:
                            self.error(f"task {task.id} references unknown requirement {requirement}", tasks_path)
                    for dependency in task.depends_on:
                        if dependency not in tasks:
                            self.error(f"task {task.id} depends on unknown task {dependency}", tasks_path)

            if entry.status in READY_SLICE_STATUSES and not tasks_path.exists():
                self.error(f"slice {entry.id} is {entry.status} but tasks.md is missing", tasks_path)

            if entry.status in READY_SLICE_STATUSES and tasks:
                implemented_requirements = {requirement for task in tasks.values() for requirement in task.implements}
                uncovered = sorted(requirement for requirement in requirements if requirement not in implemented_requirements)
                for requirement_id in uncovered:
                    self.error(f"requirement {requirement_id} has no implementing task", tasks_path)

            if entry.status == "done":
                if is_pending_or_empty(verification_evidence):
                    self.error(f"done slice {entry.id} is missing verification evidence", tasks_path)
                if is_pending_or_empty(reconciliation_notes) and not self.system_mentions(entry.id):
                    self.error(f"done slice {entry.id} is missing reconciliation notes or a system update reference", tasks_path)

            self.slice_packages[entry.id] = SlicePackage(
                entry=entry,
                capabilities=[str(item) for item in capabilities],
                requirements={requirement_id: entry.spec_path for requirement_id in requirements},
                tasks=tasks,
                verification_evidence=verification_evidence,
                reconciliation_notes=reconciliation_notes,
            )

    def parse_tasks_file(self, tasks_path: Path, slice_id: str) -> tuple[dict[str, TaskEntry], str, str]:
        body = self.read_markdown(tasks_path)[1]
        tasks: dict[str, TaskEntry] = {}
        verification_evidence = ""
        reconciliation_notes = ""

        sections = split_second_level_sections(body)
        for title, content in sections:
            if title == "Verification Evidence":
                verification_evidence = content
                continue
            if title == "Reconciliation Notes":
                reconciliation_notes = content
                continue

            task_match = re.match(r"((?:S-\d{3}\.)?T\d+)\b", title)
            if not task_match:
                continue

            raw_task_id = task_match.group(1)
            task_id = normalize_local_ref(raw_task_id, slice_id, "T")

            previous = self.task_ids.get(task_id)
            if previous and previous != tasks_path:
                self.error(f"duplicate task ID: {task_id}", tasks_path)
            else:
                self.task_ids[task_id] = tasks_path

            implements = parse_labeled_ref_list(content, "Implements", slice_id, "R")
            depends_on = parse_labeled_ref_list(content, "Depends on", slice_id, "T")
            tasks[task_id] = TaskEntry(id=task_id, implements=implements, depends_on=depends_on)

        return tasks, verification_evidence, reconciliation_notes

    def validate_milestones(self) -> None:
        for milestone in self.milestones.values():
            for section in ["Outcome", "Integrated Demonstration", "Exit Criteria"]:
                if not has_section(milestone.body, section):
                    self.error(f"milestone {milestone.id} is missing section '{section}'", milestone.path)

            for slice_id in milestone.slices:
                if slice_id not in self.roadmap_entries:
                    self.error(f"milestone {milestone.id} references unknown slice {slice_id}", milestone.path)

            if milestone.status == "passed":
                for slice_id in milestone.slices:
                    entry = self.roadmap_entries.get(slice_id)
                    if entry and entry.status != "done":
                        self.error(f"milestone {milestone.id} is passed but slice {slice_id} is not done", milestone.path)

        for entry in self.roadmap_entries.values():
            if entry.milestone and entry.milestone in self.milestones:
                milestone = self.milestones[entry.milestone]
                if entry.id not in milestone.slices:
                    self.error(f"roadmap slice {entry.id} references milestone {entry.milestone} but the milestone does not list the slice", milestone.path)

    def validate_supporting_artifacts(self) -> None:
        capabilities_path = self.planning_root / "CAPABILITIES.md"
        if capabilities_path.exists():
            seen_capabilities: dict[str, Path] = {}
            for capability_id in parse_capability_declarations(capabilities_path):
                if capability_id in seen_capabilities:
                    self.error(f"duplicate capability ID: {capability_id}", capabilities_path)
                else:
                    seen_capabilities[capability_id] = capabilities_path

        inbox_path = self.planning_root / "INBOX.md"
        if inbox_path.exists():
            self.validate_status_sections(inbox_path, "I", INBOX_STATUSES)

        backlog_path = self.planning_root / "BACKLOG.md"
        if backlog_path.exists():
            self.validate_status_sections(backlog_path, "B", BACKLOG_STATUSES)

        decisions_root = self.planning_root / "decisions"
        if decisions_root.exists():
            seen_decisions: dict[str, Path] = {}
            for decision_path in sorted(decisions_root.rglob("*.md")):
                if decision_path.name == "README.md":
                    continue
                metadata, _ = self.read_markdown(decision_path)
                decision_id = str(metadata.get("id", "")).strip()
                if not decision_id:
                    self.error("decision file is missing frontmatter id", decision_path)
                    continue
                if decision_id in seen_decisions:
                    self.error(f"duplicate decision ID: {decision_id}", decision_path)
                else:
                    seen_decisions[decision_id] = decision_path

    def validate_status_sections(self, path: Path, prefix: str, allowed_statuses: set[str]) -> None:
        seen_ids: set[str] = set()
        pattern = re.compile(rf"^##\s+({prefix}-\d{{3}})\b", re.MULTILINE)
        matches = list(pattern.finditer(path.read_text(encoding="utf-8")))

        for index, match in enumerate(matches):
            artifact_id = match.group(1)
            if artifact_id in seen_ids:
                self.error(f"duplicate {prefix}-item ID: {artifact_id}", path)
            seen_ids.add(artifact_id)

            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(path.read_text(encoding="utf-8"))
            block = path.read_text(encoding="utf-8")[start:end]
            status_match = re.search(r"\*\*Status:\*\*\s*([a-z-]+)", block)
            if status_match and status_match.group(1) not in allowed_statuses:
                self.error(f"invalid status '{status_match.group(1)}' for {artifact_id}", path)

    def validate_links(self) -> None:
        for markdown_path in sorted(self.planning_root.rglob("*.md")):
            content = strip_code_spans(markdown_path.read_text(encoding="utf-8"))
            for link_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", content):
                if is_external_link(link_target) or link_target.startswith("#"):
                    continue

                normalized_target = link_target.split("#", 1)[0]
                target_path = (markdown_path.parent / normalized_target).resolve()
                if not target_path.exists():
                    self.error(f"broken file link: {link_target}", markdown_path)

    def system_mentions(self, slice_id: str) -> bool:
        return len(self.system_references(slice_id)) > 0

    def system_references(self, slice_id: str) -> list[Path]:
        system_root = self.planning_root / "system"
        if not system_root.exists():
            return []

        matches: list[Path] = []
        for path in system_root.rglob("*.md"):
            if slice_id in path.read_text(encoding="utf-8"):
                matches.append(path)
        return matches

    def ordered_entries(self) -> list[RoadmapEntry]:
        return sorted(self.roadmap_entries.values(), key=lambda entry: entry.row_number)


def resolve_roots(target: Path) -> tuple[Path, Path]:
    target = target.resolve()

    if is_planning_root(target):
        return find_repo_root(target), target

    if (target / "planning").exists() and is_planning_root(target / "planning"):
        return target, target / "planning"

    raise SystemExit(f"Could not find a planning/ directory under {target}")


def discover_plan_roots(target: Path) -> list[Path]:
    target = target.resolve()
    if is_planning_root(target):
        return [target]

    direct = target / "planning"
    if is_planning_root(direct):
        return [direct]

    roots: list[Path] = []
    if direct.exists() and direct.is_dir():
        for child in sorted(direct.iterdir()):
            if child.is_dir() and is_planning_root(child):
                roots.append(child)
    return roots


def is_planning_root(target: Path) -> bool:
    return (
        (target / "PROJECT.md").exists()
        and (target / "ROADMAP.md").exists()
        and (target / "INBOX.md").exists()
        and (target / "specs").exists()
    )


def find_repo_root(start: Path) -> Path:
    current = start
    while True:
        if (current / ".git").exists() or (current / ".psm" / "manifest.json").exists():
            return current
        if current.name == "planning":
            return current.parent
        if current.parent == current:
            return start.parent
        current = current.parent


def read_markdown_file(path: Path) -> tuple[dict[str, object], str]:
    content = path.read_text(encoding="utf-8")
    return parse_frontmatter(content)


def strip_code_spans(content: str) -> str:
    without_fences = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    return re.sub(r"`[^`\n]*`", "", without_fences)


def parse_frontmatter(content: str) -> tuple[dict[str, object], str]:
    if not content.startswith("---\n") and not content.startswith("---\r\n"):
        return {}, content

    lines = content.splitlines()
    closing_index = None
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            closing_index = index
            break

    if closing_index is None:
        raise ValueError("unterminated frontmatter block")

    metadata = parse_simple_yaml(lines[1:closing_index])
    body = "\n".join(lines[closing_index + 1:]).lstrip("\n")
    return metadata, body


def parse_simple_yaml(lines: list[str]) -> dict[str, object]:
    data: dict[str, object] = {}
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"invalid frontmatter line: {raw_line}")
        key, value = raw_line.split(":", 1)
        data[key.strip()] = parse_yaml_value(value.strip())
    return data


def parse_yaml_value(value: str) -> object:
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [strip_quotes(item.strip()) for item in inner.split(",") if item.strip()]

    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered in {"null", "none"}:
        return None
    return strip_quotes(value)


def strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def parse_markdown_table(path: Path) -> dict[str, object]:
    table_lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip().startswith("|")]
    if len(table_lines) < 2:
        raise ValueError("ROADMAP.md must contain a markdown table")

    headers = split_table_row(table_lines[0])
    normalized_headers = {normalize_header(header): index for index, header in enumerate(headers)}
    rows: list[tuple[int, dict[str, str]]] = []

    for row_index, line in enumerate(table_lines[2:], start=3):
        cells = split_table_row(line)
        if len(cells) != len(headers):
            raise ValueError(f"ROADMAP.md row {row_index} does not match the header width")
        row = {normalize_header(header): cells[index] for index, header in enumerate(headers)}
        rows.append((row_index, row))

    return {"headers": normalized_headers, "rows": rows}


def split_table_row(line: str) -> list[str]:
    placeholder = "\x00"
    normalized = line.strip().replace("\\|", placeholder)
    normalized = normalized.strip("|")
    return [cell.replace(placeholder, "|").strip() for cell in normalized.split("|")]


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z]", "", value.lower())


def normalize_cell_value(value: str) -> str | None:
    normalized = value.strip()
    if normalized.lower() in NONE_MARKERS:
        return None
    return normalized


def canonical_slice_status(value: str) -> str:
    return "ready" if value == "approved" else value


def parse_csv_list(value: str, slice_id: str, prefix: str) -> list[str]:
    normalized = normalize_cell_value(value)
    if normalized is None:
        return []
    items = [item.strip() for item in normalized.split(",") if item.strip()]
    return [normalize_local_ref(item, slice_id, prefix) for item in items]


def normalize_local_ref(reference: str, slice_id: str, prefix: str) -> str:
    if prefix == "R" and re.fullmatch(r"R\d+", reference):
        return f"{slice_id}.{reference}"
    if prefix == "T" and re.fullmatch(r"T\d+", reference):
        return f"{slice_id}.{reference}"
    return reference


def parse_requirement_ids(body: str, slice_id: str) -> list[str]:
    ids = []
    for match in re.finditer(r"^###\s+((?:S-\d{3}\.)?R\d+)\b", body, re.MULTILINE):
        ids.append(normalize_local_ref(match.group(1), slice_id, "R"))
    return ids


def split_second_level_sections(body: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"^##\s+(.+)$", body, re.MULTILINE))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        sections.append((title, body[start:end].strip()))
    return sections


def parse_labeled_ref_list(content: str, label: str, slice_id: str, prefix: str) -> list[str]:
    pattern = re.compile(rf"^\*\*{re.escape(label)}:\*\*\s*(.+)$", re.MULTILINE)
    match = pattern.search(content)
    if not match:
        return []
    raw_value = match.group(1).strip()
    if raw_value.lower() in NONE_MARKERS:
        return []
    return [normalize_local_ref(item.strip(), slice_id, prefix) for item in raw_value.split(",") if item.strip()]


def has_section(body: str, heading: str) -> bool:
    return re.search(rf"^##\s+{re.escape(heading)}\b", body, re.MULTILINE) is not None


def is_pending_or_empty(value: str) -> bool:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    return not normalized or normalized in {"pending.", "pending", "- pending.", "- pending"}


def parse_capability_declarations(path: Path) -> list[str]:
    ids = []
    pattern = re.compile(r"^\s*[-*]?\s*`?(C-\d{3})`?\b", re.MULTILINE)
    for match in pattern.finditer(path.read_text(encoding="utf-8")):
        ids.append(match.group(1))
    return ids


def is_external_link(target: str) -> bool:
    return bool(re.match(r"^[a-z]+://", target))


def extract_first_heading(content: str) -> str | None:
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    return match.group(1).strip() if match else None


def relative_to_repo(path: Path, repo_root: Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)


def format_refs(values: list[str]) -> str:
    return ", ".join(values) if values else "—"


def format_slice(entry: RoadmapEntry) -> str:
    return f"{entry.id} — {entry.title}" if entry.title else entry.id


def inbox_status_counts(path: Path) -> dict[str, int]:
    counts: dict[str, int] = {status: 0 for status in INBOX_STATUSES}
    if not path.exists():
        return counts

    content = path.read_text(encoding="utf-8")
    pattern = re.compile(r"^##\s+(I-\d{3})\b", re.MULTILINE)
    matches = list(pattern.finditer(content))

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        block = content[start:end]
        status_match = re.search(r"\*\*Status:\*\*\s*([a-z-]+)", block)
        status = status_match.group(1) if status_match else "untriaged"
        counts[status] = counts.get(status, 0) + 1

    return counts


def current_milestones(validator: Validator) -> list[Milestone]:
    active = [milestone for milestone in validator.milestones.values() if milestone.status == "active"]
    if active:
        return sorted(active, key=lambda milestone: milestone.id)

    inferred = []
    for milestone in sorted(validator.milestones.values(), key=lambda item: item.id):
        if any(validator.roadmap_entries.get(slice_id) and validator.roadmap_entries[slice_id].status != "done" for slice_id in milestone.slices):
            inferred.append(milestone)
    return inferred[:1]


def milestone_progress(validator: Validator, milestone: Milestone) -> tuple[int, int]:
    total = len(milestone.slices)
    done = sum(1 for slice_id in milestone.slices if validator.roadmap_entries.get(slice_id) and validator.roadmap_entries[slice_id].status == "done")
    return done, total


def dependencies_done(validator: Validator, entry: RoadmapEntry) -> bool:
    return all(validator.roadmap_entries.get(dependency) and validator.roadmap_entries[dependency].status == "done" for dependency in entry.depends_on)


def next_slice(validator: Validator) -> RoadmapEntry | None:
    ordered = validator.ordered_entries()
    for entry in ordered:
        if entry.status == "ready":
            return entry
    for entry in ordered:
        if entry.status == "planned" and dependencies_done(validator, entry):
            return entry
    for entry in ordered:
        if entry.status == "planned":
            return entry
    return None


def roadmap_risks(validator: Validator) -> list[str]:
    risks: list[str] = []
    active_slices = [entry for entry in validator.ordered_entries() if entry.status == "active"]
    blocked_slices = [entry for entry in validator.ordered_entries() if entry.status == "blocked"]

    if len(active_slices) > 1:
        risks.append(f"multiple active slices: {format_refs([entry.id for entry in active_slices])}")
    if blocked_slices:
        risks.append(f"blocked slices present: {format_refs([entry.id for entry in blocked_slices])}")
    if not current_milestones(validator) and any(entry.status != "done" for entry in validator.ordered_entries()):
        risks.append("no active milestone is identified for remaining work")

    for entry in validator.ordered_entries():
        if entry.status in {"ready", "active"} and not dependencies_done(validator, entry):
            risks.append(f"{entry.id} is {entry.status} but depends on unfinished slices")

    if not next_slice(validator) and any(entry.status != "done" for entry in validator.ordered_entries()):
        risks.append("no executable next slice could be derived")

    return risks


def print_status_report(validator: Validator) -> int:
    current = current_milestones(validator)
    active_slices = [entry for entry in validator.ordered_entries() if entry.status == "active"]
    blocked_slices = [entry for entry in validator.ordered_entries() if entry.status == "blocked"]
    recent_done = [entry for entry in validator.ordered_entries() if entry.status == "done"][-3:]
    inbox_counts = inbox_status_counts(validator.planning_root / "INBOX.md")
    derived_next = next_slice(validator)
    risks = roadmap_risks(validator)

    print(f"Project status for {validator.project_title}")
    print(f"Plan root: {relative_to_repo(validator.planning_root, validator.repo_root)}")
    if current:
        summaries = []
        for milestone in current:
            done, total = milestone_progress(validator, milestone)
            summaries.append(f"{milestone.id} [{milestone.status}] ({done}/{total} done)")
        label = "Current milestone" if len(summaries) == 1 else "Current milestones"
        print(f"{label}: {format_refs(summaries)}")
    else:
        print("Current milestone: —")

    print(f"Active slices: {format_refs([format_slice(entry) for entry in active_slices])}")
    if derived_next is None:
        print("Next slice: —")
    else:
        print(f"Next slice: {format_slice(derived_next)} [{derived_next.status}]")
    print(f"Blocked slices: {format_refs([format_slice(entry) for entry in blocked_slices])}")
    print("Recently completed:")
    if recent_done:
        for entry in reversed(recent_done):
            print(f"- {format_slice(entry)}")
    else:
        print("- none")
    print(f"Untriaged Inbox items: {inbox_counts.get('untriaged', 0)}")
    print("Roadmap risks:")
    if risks:
        for risk in risks:
            print(f"- {risk}")
    else:
        print("- none")

    return 0


def print_trace_report(validator: Validator, slice_id: str) -> int:
    entry = validator.roadmap_entries.get(slice_id)
    if entry is None:
        print(f"Slice not found: {slice_id}")
        return 1

    required_by = [other.id for other in validator.ordered_entries() if entry.id in other.depends_on]
    package = validator.slice_packages.get(slice_id)

    print(f"Trace for {format_slice(entry)}")
    print(f"Plan root: {relative_to_repo(validator.planning_root, validator.repo_root)}")
    print(f"Status: {entry.status}")
    print(f"Milestone: {entry.milestone or '—'}")
    print(f"Depends on: {format_refs(entry.depends_on)}")
    print(f"Required by: {format_refs(required_by)}")
    print(f"Spec: {relative_to_repo(entry.spec_path, validator.repo_root) if entry.spec_path else '—'}")

    if package is None:
        print("No slice package linked yet.")
        return 0

    print(f"Capabilities: {format_refs(package.capabilities)}")
    print("")
    print("Requirements")
    if package.requirements:
        for requirement_id in sorted(package.requirements):
            task_ids = sorted(task.id for task in package.tasks.values() if requirement_id in task.implements)
            print(f"- {requirement_id} -> {format_refs(task_ids)}")
    else:
        print("- none")

    print("")
    print("Tasks")
    if package.tasks:
        for task_id in sorted(package.tasks):
            task = package.tasks[task_id]
            print(f"- {task.id}: implements {format_refs(task.implements)}; depends on {format_refs(task.depends_on)}")
    else:
        print("- none")

    print("")
    print("Verification Evidence")
    print(package.verification_evidence or "Pending.")
    print("")
    print("Reconciliation Notes")
    print(package.reconciliation_notes or "Pending.")
    print("")
    print("System references")
    references = [relative_to_repo(path, validator.repo_root) for path in validator.system_references(slice_id)]
    if references:
        for reference in references:
            print(f"- {reference}")
    else:
        print("- none")

    return 0


def print_milestone_report(validator: Validator, milestone_id: str) -> int:
    milestone = validator.milestones.get(milestone_id)
    if milestone is None:
        print(f"Milestone not found: {milestone_id}")
        return 1

    title = extract_first_heading(milestone.body) or milestone.id
    entries = [validator.roadmap_entries.get(slice_id) for slice_id in milestone.slices]
    counts = {status: 0 for status in SLICE_STATUSES}
    for entry in entries:
        if entry is not None:
            counts[entry.status] = counts.get(entry.status, 0) + 1

    print(f"Milestone {milestone.id} — {title}")
    print(f"Plan root: {relative_to_repo(validator.planning_root, validator.repo_root)}")
    print(f"Status: {milestone.status}")
    print(
        "Slices: total {total}, done {done}, ready {ready}, active {active}, blocked {blocked}, planned {planned}".format(
            total=len(milestone.slices),
            done=counts.get("done", 0),
            ready=counts.get("ready", 0),
            active=counts.get("active", 0),
            blocked=counts.get("blocked", 0),
            planned=counts.get("planned", 0),
        )
    )
    print("Included slices")
    for slice_id in milestone.slices:
        entry = validator.roadmap_entries.get(slice_id)
        if entry is None:
            print(f"- {slice_id} [unknown]")
        else:
            print(f"- {format_slice(entry)} [{entry.status}]")

    print("Remaining slices")
    remaining = [entry for entry in entries if entry is not None and entry.status != "done"]
    if remaining:
        for entry in remaining:
            print(f"- {format_slice(entry)} [{entry.status}]")
    else:
        print("- none")

    print("Blocking slices")
    blocking = [entry for entry in entries if entry is not None and entry.status == "blocked"]
    if blocking:
        for entry in blocking:
            print(f"- {format_slice(entry)}")
    else:
        print("- none")

    return 0


def print_report(validator: Validator) -> int:
    if not validator.issues:
        print(f"PSM validation passed for {validator.repo_root}")
        return 0

    print(f"PSM validation failed for {validator.repo_root}")
    for issue in validator.issues:
        if issue.path:
            try:
                relative_path = issue.path.relative_to(validator.repo_root)
            except ValueError:
                relative_path = issue.path
            print(f"- {relative_path}: {issue.message}")
        else:
            print(f"- {issue.message}")
    return 1


def run_validate(args: argparse.Namespace) -> int:
    if getattr(args, "all_roots", False):
        roots = discover_plan_roots(Path(args.path))
        if not roots:
            print(f"No plan roots found under {Path(args.path).resolve()}", file=sys.stderr)
            return 1
        exit_code = 0
        for index, root in enumerate(roots):
            if index > 0:
                print("")
            print(f"# {root}")
            validator = Validator(root, strict=args.strict)
            validator.run()
            if print_report(validator) != 0:
                exit_code = 1
        return exit_code

    validator = Validator(Path(args.path), strict=args.strict)
    validator.run()
    return print_report(validator)


def run_status(args: argparse.Namespace) -> int:
    validator = Validator(Path(args.path), strict=False)
    if not validator.run():
        return print_report(validator)
    return print_status_report(validator)


def run_trace(args: argparse.Namespace) -> int:
    validator = Validator(Path(args.path), strict=False)
    if not validator.run():
        return print_report(validator)
    return print_trace_report(validator, args.slice_id)


def run_milestone(args: argparse.Namespace) -> int:
    validator = Validator(Path(args.path), strict=False)
    if not validator.run():
        return print_report(validator)
    return print_milestone_report(validator, args.milestone_id)


def run_coverage(args: argparse.Namespace) -> int:
    validator = Validator(Path(args.path), strict=False)
    if not validator.run():
        return print_report(validator)
    package = validator.slice_packages.get(args.slice_id)
    if package is None:
        print(f"Slice not found or has no spec: {args.slice_id}")
        return 1

    print(f"Coverage for {args.slice_id}")
    if not package.requirements:
        print("No explicit requirements declared.")
        return 0

    for requirement_id in sorted(package.requirements):
        tasks = sorted(task.id for task in package.tasks.values() if requirement_id in task.implements)
        status = "covered" if tasks else "uncovered"
        print(f"- {requirement_id}: {', '.join(tasks) if tasks else '—'} [{status}]")

    return 0


def run_next_id(args: argparse.Namespace) -> int:
    _, planning_root = resolve_roots(Path(args.path))
    prefix_map = {
        "slice": "S",
        "milestone": "M",
        "inbox": "I",
        "backlog": "B",
        "capability": "C",
        "decision": "D",
    }
    prefix = prefix_map[args.id_type]
    pattern = re.compile(rf"\b{prefix}-([0-9]{{3}})\b")
    maximum = 0

    for markdown_path in planning_root.rglob("*.md"):
        content = markdown_path.read_text(encoding="utf-8")
        for match in pattern.finditer(content):
            maximum = max(maximum, int(match.group(1)))

    print(f"{prefix}-{maximum + 1:03d}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate a Project Slice Method planning tree.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate a repository or planning directory.")
    validate_parser.add_argument("path", nargs="?", default=".")
    validate_parser.add_argument("--strict", action="store_true")
    validate_parser.add_argument("--all", dest="all_roots", action="store_true", help="Discover and validate every plan root under the path.")
    validate_parser.set_defaults(handler=run_validate)

    status_parser = subparsers.add_parser("status", help="Print machine-derived project status.")
    status_parser.add_argument("path", nargs="?", default=".")
    status_parser.set_defaults(handler=run_status)

    trace_parser = subparsers.add_parser("trace", help="Show dependencies, requirements, and evidence for one slice.")
    trace_parser.add_argument("slice_id")
    trace_parser.add_argument("path", nargs="?", default=".")
    trace_parser.set_defaults(handler=run_trace)

    milestone_parser = subparsers.add_parser("milestone", help="Show milestone composition and current slice state.")
    milestone_parser.add_argument("milestone_id")
    milestone_parser.add_argument("path", nargs="?", default=".")
    milestone_parser.set_defaults(handler=run_milestone)

    coverage_parser = subparsers.add_parser("coverage", help="Show requirement coverage for one slice.")
    coverage_parser.add_argument("slice_id")
    coverage_parser.add_argument("path", nargs="?", default=".")
    coverage_parser.set_defaults(handler=run_coverage)

    next_id_parser = subparsers.add_parser("next-id", help="Return the next available stable ID.")
    next_id_parser.add_argument("id_type", choices=["slice", "milestone", "inbox", "backlog", "capability", "decision"])
    next_id_parser.add_argument("path", nargs="?", default=".")
    next_id_parser.set_defaults(handler=run_next_id)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except SystemExit as error:
        print(error, file=sys.stderr)
        return 1
    except Exception as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())