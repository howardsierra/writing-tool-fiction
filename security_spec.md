# Security Spec

## Data Invariants
1. A Project belongs to a single user (userId).
2. A Document must belong to an existing Project and the userId on the Document must match the request auth and the Project's userId.
3. Tags array cannot exceed 20 elements, and each tag cannot exceed 50 characters.
4. Document content cannot exceed 100,000 characters.

## The Dirty Dozen Payloads
1. Create Project with spoofed userId.
2. Create Document with spoofed userId.
3. Create Document linking to another user's projectId.
4. Update Project's userId.
5. Add 21 tags to Document.
6. Inject 2000 character tag.
7. Update Document status to non-existent type.
8. Update Document bypassing validation (shadow update with extra field).
9. Delete another user's Project.
10. Read another user's Document.
11. Query projects without filtering by own userId.
12. Create Project with missing title.
