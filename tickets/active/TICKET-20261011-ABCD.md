---
id: TICKET-20261011-ABCD
title: "Add user authentication module"
status: active
created: "2026-10-11T12:00:00.000Z"
updated: "2026-10-11T12:00:00.000Z"
acceptance_criteria:
  - "User can register with email and password"
  - "User can login and receive JWT token"
  - "Protected routes reject requests without valid token"
  - "Passwords are hashed with bcrypt (cost >= 10)"
  - "Token expires after 24 hours"
verify_commands:
  - "npm test"
  - "npm run lint"
labels:
  - "feature"
  - "auth"
  - "backend"
---

## Context
The application needs a user authentication system. Currently there is no auth module. We need to implement registration, login, and JWT-based protected routes following the existing Express.js patterns in the codebase.

## Requirements
- Create `/auth/register` endpoint accepting email/password
- Create `/auth/login` endpoint returning JWT
- Create auth middleware for protecting routes
- Use bcrypt for password hashing
- Store users in existing database (PostgreSQL via Prisma)
- Follow existing code style and patterns in `src/`

## Notes
- Check `src/middleware/` for existing middleware patterns
- Check `src/routes/` for route structure
- Use `src/utils/` for shared utilities
- Prisma schema already has User model