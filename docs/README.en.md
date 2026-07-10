# IRabi — Expert and User Platform

IRabi is a web platform connecting experts and users. Experts publish available time slots for consultations, and users can book those slots.

## Key Features

### For Experts
- Set available time slots for booking
- Manage schedules through slot creation (single and batch)
- Receive payments for consultations

### For Users
- Browse available experts and slots
- Book consultations in available time slots

## User Roles

| Role | Description |
|------|-------------|
| **User** | Basic role, can browse experts and book slots |
| **Expert** | Can create time slots, manage schedules, and accept bookings |
| **Moderator** | Reviews and approves experts |
| **Owner** | Full platform management |
| **Admin** | System settings and technical management |

## Project Structure

```
Apps/IRabi/
├── Common/           # Shared code (DB tables, configs, translations)
├── Dashboard/        # Admin panel for moderators
├── Foreground/       # Main interface for experts and users
├── Migrations/       # Database migrations
└── WorkDir/          # Working files (configs, cache, logs)
```

## Technology Stack

- **Backend:** PHP 8.x + Garnet Framework
- **Frontend:** TypeScript + Rspack
- **Database:** MySQL
- **Templates:** Twig
- **CSS:** Less + Bootstrap 5

## Documentation

- [Database Structure](database.md) — Tables and relationships
- [Data Model](data-model.md) — ER-diagram and table descriptions
- [Workflow](workflows.md) — Business processes and user flows
- [Architecture](architecture.md) — Application structure
- [Roles & Permissions](roles.md) — Role hierarchy and access matrix
- [Development Guide](development.md) — Setup and development instructions
- [Expert API](expert-api.md) — Expert panel API endpoints

Playwright testing guide lives in [`Tests/TESTING.md`](../Tests/TESTING.md).
