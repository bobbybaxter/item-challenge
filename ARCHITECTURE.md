# Architecture Documentation

## Data model design

### DynamoDB table schema

| Property       | Value                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Table name** | `exam-items` (`aws_dynamodb_table.exam_items` in `terraform/main.tf`; overridable via `DYNAMODB_TABLE_NAME`) |
| **Billing**    | On-demand (`PAY_PER_REQUEST`)                                                                                |
| **Item model** | Single entity type: one DynamoDB item = one `ExamItem` (see `src/types/item.ts`)                             |

Attributes persisted on each item (beyond the key) include: `subject`, `itemType`, `difficulty`, `content`, `securityLevel`, and nested `metadata` (`author`, `created`, `lastModified`, `version`, `status`, `tags`). DynamoDB is schemaless except for key attributes; the application owns the full document shape.

### Key design

| Role              | Attribute | Type       | Notes                                           |
| ----------------- | --------- | ---------- | ----------------------------------------------- |
| **Partition key** | `id`      | String (S) | UUID generated on create; matches `ExamItem.id` |
| **Sort key**      | —         | —          | Not used                                        |

This is a **single-table, single-entity** pattern: every access path that needs a single item is keyed by `id`. **GetItem** and **PutItem** (create/update) use `{ id }` only. There is no composite key, no item collection, and no relational normalization across tables.

### GSI strategy

**Current state: no Global Secondary Indexes (GSIs).**

- **Rationale:** The implemented access patterns are **get by id**, **put whole item**, and **list with a limit**. The first two are satisfied by the primary key. Listing uses a **Scan** with `Limit` (`src/storage/dynamodb.ts`), so no secondary index is required for the current code path.
- **`ListItemsQuery`** (`subject`, `status`, `offset`) is part of the type surface, but the DynamoDB implementation does **not** filter by `subject` or `status`; `offset` is not applied. Efficient filtering or sorting by those dimensions would require a deliberate index design.

**If GSIs were added later** (examples, not implemented):

| Candidate access pattern       | Possible GSI             | Partition / sort keys (illustrative)   |
| ------------------------------ | ------------------------ | -------------------------------------- |
| List/filter by subject         | GSI on `subject`         | PK `subject`, SK `id` or `created`     |
| List/filter by workflow status | GSI on `status`          | PK `status`, SK `id` or `lastModified` |
| Author-owned queries           | GSI on `metadata.author` | PK `author`, SK `created`              |

Any GSI would need matching `attribute` definitions in Terraform and application **Query** paths replacing or narrowing **Scan**. Version history or audit trails would likely use a **different key design** (e.g. sort key `VERSION#<n>` on the same table or a separate table), not a simple GSI on the current item shape.

---

## Infrastructure choices

| Component                    | Choice                                                           | Why                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database**                 | DynamoDB                                                         | Managed, low ops, fits key-value and document-style items; scales read/write with workload when using on-demand billing.                                                        |
| **Billing mode**             | `PAY_PER_REQUEST`                                                | No capacity planning for variable or spiky traffic; pay per request unit. Fits a challenge/demo API without tuning RCUs/WCUs.                                                   |
| **Compute (Terraform)**      | AWS Lambda (`nodejs20.x`) + API Gateway HTTP API                 | Serverless request/response model aligns with stateless HTTP handlers; scales with API traffic; Terraform wires Lambda + HTTP API with proxy integration (`terraform/main.tf`). |
| **IaC**                      | Terraform                                                        | Declarative AWS resources (table, IAM, Lambda, API Gateway, CloudWatch log group) in one place.                                                                                 |
| **Local / optional runtime** | Node HTTP server (`src/server.ts`), in-memory storage by default | Fast local iteration without AWS; `USE_DYNAMODB=true` and optional `DYNAMODB_ENDPOINT` switch to DynamoDB or DynamoDB Local.                                                    |

The placeholder Lambda package in Terraform is a minimal zip; deploying this repo’s real handler would replace that artifact while keeping the same integration pattern.

---

## Scalability

**How the design scales**

- **API layer:** API Gateway HTTP API and Lambda scale horizontally with concurrent requests (within account/service limits). Each request is independent; no sticky sessions are assumed.
- **DynamoDB:** On-demand mode scales throughput automatically; single-item **GetItem**/**PutItem** by `id` spread load across partitions as key space is well distributed (random UUIDs avoid hot partitions for point reads/writes).
- **Per-item operations:** Create/read/update by `id` are O(1) keyed operations and remain the strong path at large data sizes.

**Potential bottlenecks**

| Area               | Risk               | Detail                                                                                                                                                                                                                                        |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **List**           | **Scan** + limit   | Scans read increasing portions of the table as data grows; cost and latency grow with table size, not with “page size” alone. Not suitable as the primary discovery mechanism at very large scale without GSIs or a different access pattern. |
| **Updates**        | Read-modify-write  | `updateItem` loads the full item then **PutItem**s the whole document. High contention on the same `id` could cause retries/lost updates without conditional writes or partial **UpdateItem** expressions.                                    |
| **Hot partitions** | Low for random IDs | Predictable, sequential, or low-cardinality IDs could concentrate traffic on one partition key.                                                                                                                                               |
| **Account limits** | Operational        | Lambda concurrency, API Gateway throttle limits, and DynamoDB per-account quotas still apply and may need review for production peaks.                                                                                                        |

---

## Security

**Current posture (as reflected in this repository)**

| Topic                     | Status                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**        | Not implemented in application code: HTTP handlers do not validate API keys, JWTs, or IAM-signed requests. Any deployed API should sit behind **API Gateway authorizers**, **Cognito**, **IAM**, or similar if the API must not be public.                                                                                                                              |
| **Authorization**         | No role- or tenant-based checks; any caller who can reach the API can perform implemented operations. Item-level rules (e.g. by `securityLevel` or `metadata.status`) are not enforced in code.                                                                                                                                                                         |
| **Encryption in transit** | Between clients and AWS, TLS is provided by API Gateway when using the managed HTTPS endpoint. Local `server.ts` is plain HTTP unless terminated TLS elsewhere.                                                                                                                                                                                                         |
| **Encryption at rest**    | DynamoDB encrypts tables at rest by default (AWS-managed keys; CMKs are optional and not shown in Terraform here).                                                                                                                                                                                                                                                      |
| **IAM**                   | Terraform defines a Lambda execution role assumed by `lambda.amazonaws.com`, attaches **AWSLambdaBasicExecutionRole** for logs, and an inline policy allowing **DynamoDB actions on the `exam_items` table ARN only** (not `*`). Tighten **`dynamodb:*`** to the minimum actions needed (e.g. `GetItem`, `PutItem`, `Scan`, `Query` as applicable) for least privilege. |
| **Network**               | No VPC wiring in the sample Terraform; Lambda runs in the default AWS network model. Private subnets + VPC endpoints for DynamoDB are options for stricter network isolation.                                                                                                                                                                                           |
| **CORS**                  | `src/server.ts` sets permissive CORS (`Access-Control-Allow-Origin: *`) for local development; production APIs should restrict origins.                                                                                                                                                                                                                                 |

**Field name `securityLevel`:** This is application data on the item, not an AWS security control; enforcing classification would require authz logic and possibly separate storage or KMS policies for highly sensitive content.

---

## Trade-offs

**Prioritized**

- **Simplicity and speed of delivery:** Single-table schema, UUID partition key, no GSIs, scan-based list.
- **Clear keyed access:** Get/update by `id` are straightforward and efficient.
- **Flexible local development:** In-memory storage by default; DynamoDB optional via environment variables.
- **Infrastructure sketch in Terraform:** Table + Lambda + HTTP API + IAM in one module for a coherent deploy story.

**Deferred or not implemented (good candidates with more time)**

- **Framework**: Implementing a framework aimed at serverless, like lambda-api, lambda-router, Middy, or Claudia.js could provide helpful tools like middleware management, routing, or error handling.
- **GSIs and Query-based listing** for `subject`, `status`, tags, or date-ordered feeds; replace scan for production-scale listing.
- **Authentication and authorization** at the edge (API Gateway) and/or in handlers; optional row-level rules using identity claims.
- **Conditional writes / optimistic locking** using `version` or DynamoDB `ConditionExpression` to avoid lost updates.
- **Versioning and audit** (`createVersion`, `getAuditTrail` are stubbed in DynamoDB storage): separate sort-key pattern or auxiliary table.
- **IAM least privilege:** Narrow DynamoDB actions; add KMS CMK if key hierarchy is required.
- **Observability:** Structured logging, tracing (X-Ray), and metrics/alarms beyond basic Lambda logs.
- **Pagination** that matches DynamoDB (e.g. `ExclusiveStartKey`) instead of only `Limit` on scan.

---

## Access patterns and DynamoDB operations

| Access pattern | Implementation           | Notes                                                                             |
| -------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Create item    | `PutItem`                | Full `ExamItem` written; `id` and timestamps set in `DynamoDBStorage`.            |
| Get by id      | `GetItem` on `{ id }`    | O(1) keyed read.                                                                  |
| Update item    | `GetItem` then `PutItem` | Read-modify-write replaces the whole item.                                        |
| List items     | `Scan` with `Limit`      | No GSI; optional filters in `ListItemsQuery` not applied in DynamoDB layer today. |

---

## Runtime configuration

- **`DYNAMODB_TABLE_NAME`** — must match the deployed table name (default `exam-items`, aligned with Terraform `locals.name`).
- **`DYNAMODB_ENDPOINT`** — optional; e.g. `http://localhost:8000` for DynamoDB Local.
- **`USE_DYNAMODB`** — when `true`, `createStorage()` uses `DynamoDBStorage` (`src/storage/index.ts`).
- **`AWS_REGION`** — passed to the SDK (default `us-east-1` in code; Terraform provider also uses `us-east-1`).

---

## Terraform alignment

To add GSIs, extend `aws_dynamodb_table.exam_items` with `attribute` blocks for projected keys and `global_secondary_index` definitions, then implement **Query** paths in the storage layer and update this document.
