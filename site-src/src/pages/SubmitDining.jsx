import React from 'react';
import ListingSubmissionForm from '../components/submission/ListingSubmissionForm';

// Public dining special submission form (shared with Events and Sales).
export default function SubmitDining() {
  return <ListingSubmissionForm kind="dining" />;
}
