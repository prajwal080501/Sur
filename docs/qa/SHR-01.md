# SHR 01 Share-link verification

The first share slice is split between a storage-independent domain package and thin NestJS HTTP
adapters. A share can be created only for an owner-visible take that already has a private cloud
audio object. The API never accepts raw PCM or a browser blob as part of share creation.

Automated domain tests verify:

- local-only takes are rejected before media publication;
- projects containing third-party stems return `STEMS_NOT_SHAREABLE`;
- slug reservation is atomic, retries collisions, and rejects unsafe generated paths;
- failed activation removes copied media and releases the reservation;
- expiry and owner revocation make public resolution return gone; and
- public URL configuration is validated before publication begins.

HTTP integration tests verify the `/api/v1` create, public resolve, and revoke routes; shared Zod
validation; the standard error envelope; ownership isolation; and the development-only
`Authorization: Bearer dev-<userId>` verifier required by the specification.

Development uses deliberately in-memory adapters. Cloud mode now provides a MongoDB share
repository and take-publication read model plus S3 private-object copy, paginated prefix deletion,
HTTPS CDN URLs, ownership indexes, and expiry TTL setup. S3 adapter tests cover encoded private keys,
audio/video publication, pagination, and HTTPS enforcement.

A deployed MongoDB/S3 integration test, production JWT verification, CDN policy verification, and
operational TTL evidence remain pending and are not claimed by this result.
