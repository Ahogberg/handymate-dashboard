-- v47: Koppla offertrad till produkt i prislistan
-- När hantverkaren sparar en rad till prislistan via "Spara i prislistan"-ikonen
-- lagrar vi product-id:t på raden så vi kan visa "saved"-state och senare
-- föreslå uppdatering om värdena driftar.

alter table quote_items
  add column if not exists linked_product_id uuid references products(id) on delete set null;

create index if not exists idx_quote_items_linked_product
  on quote_items(linked_product_id)
  where linked_product_id is not null;

-- ROLLBACK (manuellt om behövs):
-- drop index if exists idx_quote_items_linked_product;
-- alter table quote_items drop column if exists linked_product_id;
