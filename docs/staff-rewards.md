# Staff free-drink rewards

Each employee earns one free drink per six cups from their own fulfilled regular sales (`NORMAL_SALE`). Balances carry across shifts and include existing fulfilled sales. XXL sales count toward the six cups, but products whose name or category contains `XXL` (case insensitive) cannot be redeemed. Staff-price orders, waste and free drinks do not earn rewards.

In the POS, choose **Free Drink**, select eligible drinks, then **Redeem**. The reward summary shows available drinks and cups needed for the next reward. No payment is collected. The order appears on the dashboard as **Staff Reward · Free Drink** and follows the normal preparation workflow.

Redemption reserves the entitlement immediately, even while preparation is pending. Retrying the same transaction does not spend it again. Deleting a pending redemption returns its entitlement. Marking a sale pending removes its earned cups; if those rewards have already been spent, subsequent sales first cover the shortfall. Toggling a redemption's preparation status never returns its entitlement.

## Activation

Apply `supabase/migrations/202609220001_staff_rewards.sql` after the existing migrations, before deploying the updated application. This adds the reward transaction type, balance function and database checks. The authenticated endpoint only returns the logged-in employee's balance. Redemption checks current product records and serializes balance checks per employee within the transaction. Rewards have no payment method, so they are excluded from MPay/WeChat financial income.

If using the monthly Apps Script report generator, also update `apps-script/financial-reports.gs` so its reconciliation skips free-drink orders.

Run `pnpm test` and `pnpm build`. The database integration test runs the migration chain in a disposable local PostgreSQL-compatible PGlite database; it does not modify the live Supabase database.
