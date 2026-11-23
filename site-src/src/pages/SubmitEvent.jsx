import React from 'react';
import ListingSubmissionForm from '../components/submission/ListingSubmissionForm';

// Public event submission form. The fields and rules are shared with the
// Dining and Sale forms (see components/submission/ListingSubmissionForm.jsx).
// isEmbedded is passed by MultiSubmission; the shared form renders the same either way.
// eslint-disable-next-line no-unused-vars
export default function SubmitEvent({ isEmbedded = false }) {
  return <ListingSubmissionForm kind="event" />;
}
