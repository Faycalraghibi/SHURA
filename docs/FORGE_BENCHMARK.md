# Forge Benchmark v1

25 skills every Forge version is scored on. About 15 are tech skills (the first market); the rest keep
the Forge general. Skills marked **ref** get a real reference outline in `benchmark/outlines/<pack>.txt`
(one topic per line), used for the coverage metric.

| # | Family | Skill | Ref outline to gather |
| --- | --- | --- | --- |
| 1 | Programming | Python | **ref**: PCEP/PCAP syllabus |
| 2 | Programming | JavaScript | **ref**: a university web programming course |
| 3 | Programming | Data Structures & Algorithms | **ref**: a CS2 / algorithms course syllabus |
| 4 | Programming | Java | |
| 5 | Data and AI | SQL | **ref**: an intro databases course syllabus |
| 6 | Data and AI | Statistics for data analysis | **ref**: an intro statistics course syllabus |
| 7 | Data and AI | Machine learning | **ref**: a university intro ML syllabus |
| 8 | Data and AI | Deep learning | |
| 9 | Data and AI | Pandas | |
| 10 | Engineering practice | Git | **ref**: Pro Git table of contents |
| 11 | Engineering practice | Software testing | |
| 12 | Engineering practice | System design | |
| 13 | Engineering practice | Docker | |
| 14 | Engineering practice | Cloud fundamentals | **ref**: a vendor cloud-fundamentals certification outline |
| 15 | Web and mobile | React | |
| 16 | Web and mobile | REST API design | |
| 17 | Mathematics | Linear algebra | |
| 18 | Mathematics | Probability | |
| 19 | Non-tech control | Japanese | (hand-written pack exists) |
| 20 | Non-tech control | Public speaking | |
| 21 | Non-tech control | Photography | |
| 22 | Non-tech control | Music theory | |
| 23 | Non-tech control | Chess | |
| 24 | Physical | Swimming technique | ceiling must come out low (E or below) |
| 25 | Physical | Guitar | ceiling must stop where audio analysis is needed |

## Metrics per Forge version

Coverage, prerequisite sanity, tier sanity, material validity (from P2), task validity (from P3),
honest ceilings, cost and time. Targets are in the build plan, section 10.

## Running

```bash
cd backend
python -m shura.forge "SQL" --reference ../benchmark/outlines/sql.txt --budget 2
```

Each run writes `forge_runs/<skill>/` with every step's output, `calls.jsonl` (tokens and cost per
call), `pack.json` and `report.json`. Runs are resumable: rerunning skips finished steps.
