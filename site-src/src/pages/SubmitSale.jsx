import React from 'react';
import ListingSubmissionForm from '../components/submission/ListingSubmissionForm';

// Public sale / store promotion submission form (shared with Events and Dining).
export default function SubmitSale() {
  return <ListingSubmissionForm kind="sale" />;
}
