-- v49: Lägg till job_type på project-tabellen
--
-- Spara jobbtyp på projektet (samma slug-format som deal.job_type).
-- Backfill från deal när möjligt så befintliga projekt redan har taggen.
--
-- Värdet refererar till job_types.slug per business — men kolumnen är TEXT
-- (inte FK) så vi inte tappar data om en jobbtyp tas bort.

alter table project add column if not exists job_type text;

create index if not exists idx_project_job_type
  on project(business_id, job_type)
  where job_type is not null;

-- Backfill: kopiera deal.job_type till project.job_type när projektet skapats
-- från en deal (matchas via project.deal_id). Påverkar bara rader där projektet
-- saknar job_type idag.
update project p
set job_type = d.job_type
from deal d
where p.business_id = d.business_id
  and p.deal_id = d.id
  and d.job_type is not null
  and (p.job_type is null or p.job_type = '');

-- ROLLBACK (manuellt om behövs):
-- drop index if exists idx_project_job_type;
-- alter table project drop column if exists job_type;
