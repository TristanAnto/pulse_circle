-- CreateAccountRole enum
CREATE TYPE "AccountRole" AS ENUM ('ELDER', 'FAMILY_MEMBER', 'NEIGHBOUR', 'GUARDIAN', 'OTHER');

-- Add nullable accountRole column to User
ALTER TABLE "User" ADD COLUMN "accountRole" "AccountRole";
