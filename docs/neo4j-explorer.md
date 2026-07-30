# Neo4j Explorer Architecture

This document defines how people may explore the Final Particle Gesture Coder
graph without weakening the project's human-review boundary. It complements
the Neo4j data model in [`CLAUDE.md`](../CLAUDE.md) and the behavioral rules in
[`product-spec.md`](product-spec.md).

The graph is evidence navigation, not an automatic source of linguistic
truth. A visualization, MCP response, or generated answer must not turn a
model suggestion into a confirmed annotation or research finding.

## Three separate access lanes

| Lane | Audience | Interface | Authority |
|---|---|---|---|
| Public corpus graph | Learners, visitors, and researchers browsing the app | `react-force-graph-2d` in Next.js, fed by `/api/graph` | Allowlisted, parameterized, confirmed-only reads |
| Researcher MCP | Trusted researchers using an MCP-capable desktop or coding client | Official Neo4j MCP server | Read-only database role and `NEO4J_READ_ONLY=true` |
| Optional graph QA | A later "Ask the confirmed corpus" feature | Neo4j GraphRAG for Python behind an application API | Confirmed-only retrieval; no annotation writes |

These lanes do not proxy one another. In particular, the public application
must not expose the MCP server, Neo4j credentials, a raw Cypher endpoint, or a
free-text Cypher box.

```text
Public browser
  -> /api/graph
  -> GraphReadRepository
       -> demo projector, or
       -> server-only Neo4j repository

Trusted MCP client
  -> official neo4j-mcp in read-only mode
  -> least-privilege Neo4j user

Optional Ask the corpus UI
  -> application QA endpoint
  -> confirmed-only GraphRAG retriever
  -> Neo4j
```

## Public graph boundary

Every production graph query starts from a confirmed clip:

```cypher
MATCH (c:Clip {status: 'confirmed'})
```

Model-derived annotation relationships are included only when their current
value was explicitly reviewed:

```cypher
WHERE annotation.confirmed = true
```

The public projection follows these rules:

- Never fall back from an absent or skipped reviewed value to its model
  suggestion.
- Omit an optional node or relationship when that field was skipped.
- Retain `video_id`, stable particle `instance_id`, exact `surface_form`, and
  absolute integer millisecond timing.
- Pair particle and gesture occurrences using their matching `instance_id`.
- Count unique `Clip` nodes separately from particle-instance relationships;
  one multi-particle clip must not be reported as several clips.
- Require project/video filters where applicable and enforce server-side node,
  relationship, depth, and execution limits.
- Expand a selected node by one or two hops instead of loading the whole
  database.
- Use only named, allowlisted query shapes with validated parameters. The
  public request never supplies Cypher text.
- Keep the Neo4j driver and credentials in server-only code. The browser
  receives a display projection, not Neo4j records or credentials.

The public API should say when a result was truncated. Its metadata should
also identify the source as `demo` or `corpus`, whether it is confirmed-only,
the unique clip count, and the particle-instance count.

## Production and demo are different data paths

The production path reads durable, human-confirmed records from Neo4j. A clip
is published idempotently after confirmation, and subsequent graph reads
enforce both the clip-status and relationship-level review gates described
above.

The demo path projects the existing Track C fixtures without writing them to
Neo4j. Demo responses and screens must carry `demo_fixture: true` and a visible
"Demo data — not research findings" label. Demo nodes, counts, and generated
answers must never be mixed with the production corpus.

If Neo4j is unavailable or unconfigured, the app may explicitly offer demo
mode. It must not silently relabel demo data as a production result.

## Stable graph projection IDs

Neo4j internal IDs and `elementId()` values are implementation details and are
not stable enough for API payloads, saved selections, deep links, or evidence
citations. The graph projection uses namespaced domain IDs, for example:

```text
Project:project-01
Video:vid03
Utterance:vid03:u17
Clip:vid03_spkA_spkB_ma_014310
Speaker:vid03:spkA
Particle:吗
ParticleInstance:vid03:u17
```

`Speaker.id` remains the source-video-local identifier. `Speaker.key` is the
globally unique `${video_id}:${speaker_id}` value used by Neo4j constraints and
relationships. The same qualification principle applies to any other
source-video-local display identifier.

The storage model may keep occurrence timing and provenance on
`CONTAINS_PARTICLE` and `ACCOMPANIED_BY` relationships. The public API may
project those relationships as virtual `ParticleInstance` and
`GestureOccurrence` nodes so users can select occurrence-specific evidence
without forcing an immediate storage migration.

## Communicative function and provenance

`CommunicativeFunction(label)` is a canonical lookup node for the current
reviewed function. A clip connects to it through `INTERPRETED_AS`.

`INTERPRETED_AS` retains:

- the original suggested label and evidence;
- suggestion source and confidence;
- the current reviewed evidence;
- confirmation state;
- review action, reviewer, and timestamp.

If a researcher edits the suggestion, the relationship targets the reviewed
`CommunicativeFunction` while keeping the original suggestion on the
relationship. This follows the project-wide rule that accepting or editing a
model value never erases its provenance.

The public corpus graph includes only confirmed `INTERPRETED_AS`
relationships. Researcher-extensible function labels remain reviewable; a
model cannot create a corpus meaning node merely by suggesting one.

## Colorful interaction without misleading emphasis

The initial public visualization uses the repository-selected
`react-force-graph-2d`. A suggested accessible palette is:

| Node kind | Color |
|---|---|
| Project | indigo |
| Video | sky blue |
| Utterance | violet |
| Clip | coral |
| Speaker | emerald |
| Participant background | teal |
| Particle and particle instance | amber |
| Gesture and gesture occurrence | pink |
| Sentence type | blue |
| Tone | lime |
| Communicative function | orange |

Color communicates node kind, not frequency, confidence, or importance.
Shapes, captions, a persistent legend, and an accessible node list must carry
the same information for users who cannot distinguish the colors. A selected
node gets a high-contrast ring, immediate neighbors remain saturated, and
unrelated nodes dim. Demo status is shown with text and a distinct border, not
color alone.

The public explorer supports pan, zoom, drag, search, label filters, curated
lenses, and a node inspector. Curated lenses can include Particle–Gesture,
Speaker–Clip, Video hierarchy, and Particle–Communicative Function. Selecting
a `Clip` exposes an evidence link to `/clips/[clipId]`.

## Trusted researcher MCP

Use the [official Neo4j MCP server](https://github.com/neo4j/mcp) and its
[current documentation](https://neo4j.com/docs/mcp/current/). The product
server exposes schema inspection, read Cypher, write Cypher, and optional GDS
procedure discovery. For this project:

- set
  [`NEO4J_READ_ONLY=true`](https://neo4j.com/docs/mcp/current/tools/#_readonly_mode);
- connect with a separate least-privilege database user;
- prefer local STDIO for a researcher's desktop client;
- require authenticated TLS and per-request credentials if HTTP transport is
  deployed;
- do not expose `write-cypher` or the MCP endpoint to public application
  users.

The older
[`neo4j-contrib/mcp-neo4j`](https://github.com/neo4j-contrib/mcp-neo4j)
collection remains a Neo4j Labs project. Its own README says it is not
supported by the Neo4j product team and offers no compatibility or
deprecation guarantees. It is not the production access boundary for this
project.

Read-only MCP prevents ordinary write tools from being exposed, but it does
not replace database authorization, query limits, or the confirmed-only data
boundary. A trusted researcher may need broader internal visibility than the
public corpus; that access must be intentional and auditable.

## Optional later GraphRAG QA

[Neo4j GraphRAG for Python](https://neo4j.com/docs/neo4j-graphrag-python/current/)
is a first-party toolkit, not an LLM model. The package is
`neo4j-graphrag`; the former `neo4j-genai` package is deprecated. Its
[retriever guide](https://neo4j.com/docs/neo4j-graphrag-python/current/user_guide_rag.html)
includes vector, vector-plus-Cypher, hybrid, hybrid-plus-Cypher, tools, and
Text2Cypher retrieval.

GraphRAG is not required for the initial node explorer. Counts, filters, and
co-occurrence views are structured questions and should use deterministic,
parameterized Cypher.

If qualitative corpus search is added later:

- index only human-confirmed transcript, clause, discourse-context, reviewed
  meaning, and reviewed evidence text;
- retain the embedding provider, model, version, and generation time;
- prefer a constrained `HybridCypherRetriever` or `VectorCypherRetriever`
  that traverses from matching confirmed text to its reviewed graph evidence;
- apply project/video and confirmation filters inside retrieval;
- return supporting clip IDs, source-video IDs, and absolute timestamps with
  every answer;
- say that the corpus lacks evidence when retrieval is insufficient;
- never use generated answers to write or relabel research annotations.

The existing structured corpus does not need an LLM knowledge-graph builder.
Its reviewed nodes and relationships remain the source of truth.

## Official implementation references

- [Neo4j JavaScript Driver: run queries](https://neo4j.com/docs/javascript-manual/current/query-simple/)
- [Neo4j MCP](https://neo4j.com/docs/mcp/current/)
- [Neo4j MCP configuration](https://neo4j.com/docs/mcp/current/configuration/)
- [Neo4j GraphRAG for Python](https://neo4j.com/docs/neo4j-graphrag-python/current/)
- [Neo4j Visualization Library React wrappers](https://neo4j.com/docs/nvl/current/react-wrappers/)
- [Neo4j Visualization Library license](https://neo4j.com/docs/reference/license/nvl/)
- [Neo4j Aura Bloom](https://neo4j.com/docs/aura/explore/introduction/)
- [`react-force-graph` project](https://github.com/vasturiano/react-force-graph)

Neo4j Visualization Library is a capable official React visualization option,
but its license limits use to Neo4j Aura or Neo4j proprietary commercial graph
products. The current repository therefore retains its documented
`react-force-graph-2d` public implementation unless the deployment and
licensing decision changes.
