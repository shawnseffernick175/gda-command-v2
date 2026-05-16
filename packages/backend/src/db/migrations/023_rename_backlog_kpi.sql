-- Rename "Backlog" KPI to "Contract Backlog" for clarity
UPDATE financial_kpis SET label = 'Contract Backlog' WHERE key = 'fin-006';
