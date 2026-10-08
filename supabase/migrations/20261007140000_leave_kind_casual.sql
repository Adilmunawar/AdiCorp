-- Leave & overtime module (1/5): the "casual" leave kind used by the standard leave set.
-- Kept in its own migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE public.leave_type_enum ADD VALUE IF NOT EXISTS 'casual';
