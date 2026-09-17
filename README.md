# IRabi

An open-source example application built on the [Garnet Framework](https://github.com/PHPCraftdream/garnet-framework) —
a two-sided booking platform connecting experts and users: experts publish
time slots for consultations, users book the ones they need.

Used as a real-world reference for the framework's conventions: role-based
access control, booking/balance flows, an admin dashboard, i18n, and a full
Playwright end-to-end test suite.

## Quick start

IRabi depends on the framework as a normal Composer package. A sibling
checkout is useful only when developing Garnet itself.

```bash
git clone https://github.com/PHPCraftdream/garnet-irabi.git IRabi
cd IRabi
./init.sh   # .env, .mcp.json, composer install, garnet setup, config:init,
            # dev-checkout marker, WorkDir/public — all in one, idempotent
# edit WorkDir/ConfigDev/{app,db,email,ssh}.ini with your local values
php garnet migration
php garnet build
php garnet serve
```

Doing it by hand instead of `./init.sh`:

```bash
copy .env.example .env         # PowerShell; use cp on Unix
copy .mcp.example.json .mcp.json
composer install
php garnet setup --skip-composer
php garnet config:init --dev   # seeds WorkDir/ConfigDev/ from templates
mkdir .vscode                  # dev-checkout marker — see Env::isDevDir()
# Windows: New-Item -ItemType Junction -Path WorkDir\public -Target Public
# Unix:    ln -s Public WorkDir/public
```

See [`docs/guides/operations/development.md`](docs/guides/operations/development.md) for the full setup guide.

## Documentation

Full documentation — architecture, data model, roles, workflows, API — lives
under [`docs/`](docs/README.md) (also available [in English](docs/README.en.md)).

Testing guide: [`Tests/TESTING.md`](Tests/TESTING.md).

Customer handover and readiness verdict: [`docs/guides/product/customer-handover.md`](docs/guides/product/customer-handover.md).

## License

Dual-licensed under MIT or Apache-2.0, at your option — see [LICENSE](LICENSE).
