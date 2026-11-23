-- ============================================================================
-- Migration: Unpublish 5 events with inverted dates to Low Confidence queue
-- Date: 2026-11-16
-- 
-- Unpublishes the 5 events (status -> 'pending') and sets data_confidence to
-- 40 (Low confidence band) with confidence_notes for staff manual review in
-- the Editorial Approvals Hub (admin-approvals.html).
-- ============================================================================

update public.vendor_events
set status = 'pending',
    data_confidence = 40,
    confidence_notes = 'ends before it starts; pending manual date review'
where id in (
    '78fc7ea7-86e4-4b66-a696-9ea23e8b95ee', -- Council New Year’s Levee (2027-01-09)
    'dce48e7d-aa29-4d52-91d4-df6ab0db2ecb', -- SLTPA presents BRENT BUTT (2027-01-29)
    '79980683-99cd-40bc-831e-960eaccf0b3d', -- SLTPA presents THE DEVIN CUDDY BAND (2027-02-11)
    '726ac1bc-1a50-4a5f-83a5-2d0bf1d045a9', -- SLTPA presents CLASSIC ALBUMS LIVE: STEVIE RAY VAUGHAN TEXAS FLOOD (2027-03-12)
    '5b476125-89ce-4846-bf78-a536cd243373'  -- SLTPA presents TIM HICKS (2027-04-09)
);

-- Verification: confirms all 5 are unpublished (pending) with Low confidence score (40)
select id, title, business_name, status, data_confidence, confidence_notes
from public.vendor_events
where id in (
    '78fc7ea7-86e4-4b66-a696-9ea23e8b95ee',
    'dce48e7d-aa29-4d52-91d4-df6ab0db2ecb',
    '79980683-99cd-40bc-831e-960eaccf0b3d',
    '726ac1bc-1a50-4a5f-83a5-2d0bf1d045a9',
    '5b476125-89ce-4846-bf78-a536cd243373'
);
