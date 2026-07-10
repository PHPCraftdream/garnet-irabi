<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Entity\Account;

use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account as BaseAccount;

/**
 * IRabi Account override.
 *
 * Two-axis role model — the two axes are independent:
 *
 *   1. Business role (db_accounts.type ∈ {'user', 'expert'})
 *      — chosen by the user at registration, determines the business
 *        UI (booking flow for users, slot management for experts).
 *
 *   2. Staff roles (EAV flags in db_accounts_data)
 *      — IS_ADMIN, IS_OWNER, IS_MODERATOR — granted by an admin.
 *        Additive on top of any business role: a staff member always
 *        has a business role too. Hierarchy: admin ⊇ owner ⊇ moderator,
 *        encoded in UserEntityConfig::is{Admin,Owner,Moderator}().
 *
 * Staff flags must NOT subtract from business capabilities — an
 * admin whose business role is 'user' still books slots as a user.
 *
 * Low-level flag checks live on Framework\BaseAccount (isAdmin(),
 * isOwner(), isModerator()) and read the EAV flags. Session-scoped
 * higher-level helpers (with the staff hierarchy applied) live on
 * Apps\IRabi\Foreground\Params\UserEntityConfig.
 */
class Account extends BaseAccount {
}
