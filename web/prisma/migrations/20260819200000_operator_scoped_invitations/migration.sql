-- Per-operator scope for console editors.
--
-- Null means network-wide, which is what super-admin, admin and maintainer
-- keep. A `route-operator` carries a code and may only edit routes assigned
-- to that operator (enforced in lib/operator-scope.ts).
ALTER TABLE "user" ADD COLUMN "operatorCode" "OperatorCode";
ALTER TABLE "invitation" ADD COLUMN "operatorCode" "OperatorCode";
