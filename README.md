# IRabi

An open-source example application built on the [Garnet Framework](https://github.com/PHPCraftdream/garnet-framework) —
a two-sided booking platform connecting experts and users: experts publish
time slots for consultations, users book the ones they need.

Used as a real-world reference for the framework's conventions: role-based
access control, booking/balance flows, an admin dashboard, i18n, and a full
Playwright end-to-end test suite.

## Quick start

IRabi depends on the framework via a Composer path repository, so check it
out as a sibling directory first:

```bash
git clone https://github.com/PHPCraftdream/garnet-framework.git
git clone https://github.com/PHPCraftdream/garnet-irabi.git IRabi
cd IRabi

cp .env.example .env
composer install
php garnet config:init --dev    # seeds WorkDir/ConfigDev/ from templates
# edit WorkDir/ConfigDev/{app,db,email,ssh}.ini with your local values
php garnet migration
php garnet build
php garnet serve
```

See [`docs/development.md`](docs/development.md) for the full setup guide.

## Documentation

Full documentation — architecture, data model, roles, workflows, API — lives
under [`docs/`](docs/README.md) (also available [in English](docs/README.en.md)).

Testing guide: [`Tests/TESTING.md`](Tests/TESTING.md).

## License

Dual-licensed under MIT or Apache-2.0, at your option — see [LICENSE](LICENSE).
