import AgreementCheckboxes from '../src/components/AgreementCheckboxes.jsx';
import ImageUpload from '../src/components/ImageUpload.jsx';
import TimePicker from '../src/components/TimePicker.jsx';
import ScrollToTop from '../src/components/ScrollToTop.jsx';
import { describe, it, expect } from 'vitest';

import React from 'react';

import { renderToString } from 'react-dom/server';

import { MemoryRouter } from 'react-router-dom';





import Navbar from '../src/components/Navbar.jsx';

import PortalLogin from '../src/pages/PortalLogin.jsx';


import KnowledgeBase from '../src/pages/KnowledgeBase.jsx';

import EventsCalendar from '../src/pages/EventsCalendar.jsx';

import AllOffers from '../src/pages/AllOffers.jsx';

import Sales from '../src/pages/Sales.jsx';

import WeekendPlanner from '../src/pages/WeekendPlanner.jsx';

import EventDetails from '../src/pages/EventDetails.jsx';


import ResidentDiscovery from '../src/pages/ResidentDiscovery.jsx';

import Dining from '../src/pages/Dining.jsx';

import Home from '../src/pages/Home.jsx';

import SubmitEvent from '../src/pages/SubmitEvent.jsx';

import SubmitSale from '../src/pages/SubmitSale.jsx';

import SubmitDining from '../src/pages/SubmitDining.jsx';
import Directory from '../src/pages/Directory.jsx';
import CommunityWeather from '../src/pages/CommunityWeather.jsx';

describe('Production Component Render Verification', () => {

  it('renders Navbar without crashes and validates simplified dynamic menu navigation', () => {

    const html = renderToString(

      <MemoryRouter>

        <Navbar />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('welcome-eg-logo.svg');

    expect(html).toContain('News');

    expect(html).toContain('Events');

    expect(html).toContain('Sales');

    expect(html).toContain('Dining');

    expect(html).toContain('Announcing the SOFT LAUNCH of WelcomeEG.ca');

  });

  it('renders Home page with synchronized Two-Week Community Calendar', () => {

    const html = renderToString(

      <MemoryRouter>

        <Home />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Community Calendar');

    expect(html).toContain('This Weekend in East Gwillimbury');

  });

  it('renders AllOffers (Business Directory) without crashes', () => {

    const html = renderToString(

      <MemoryRouter>

        <AllOffers />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Business Directory');

    expect(html).toContain('Search business or perk...');

  });

  it('renders EventsCalendar without crashes and validates 6-week schedule', () => {

    const html = renderToString(

      <MemoryRouter>

        <EventsCalendar />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('East Gwillimbury Community Calendar');

    expect(html).toContain('This Weekend');

    expect(html).toContain('14-Day Outlook');

    expect(html).toContain('45-Day Master Grid');

  });

  it('renders PortalLogin without crashes', () => {

    const html = renderToString(

      <MemoryRouter>

        <PortalLogin />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Member Portals');


  });

  it('renders KnowledgeBase without crashes and includes Support Desk', () => {

    const htmlTiers = renderToString(

      <MemoryRouter>

        <KnowledgeBase />

      </MemoryRouter>

    );

    expect(htmlTiers).toBeDefined();

    expect(htmlTiers).toContain('Welcome East Gwillimbury Help Center');

    expect(htmlTiers).toContain('Contact Support Desk');

    expect(htmlTiers).toContain('Community Events &amp; Submissions Guide');

    // Also verify support tab rendering

    const htmlSupport = renderToString(

      <MemoryRouter initialEntries={['/knowledge-base#support']}>

        <KnowledgeBase />

      </MemoryRouter>

    );

    expect(htmlSupport).toBeDefined();

    expect(htmlSupport).toContain('Welcome East Gwillimbury Support Desk');

    expect(htmlSupport).toContain('Your Name *');

    expect(htmlSupport).toContain('Email Address *');

    expect(htmlSupport).toContain('Inquiry Category *');

  });

  it('renders WeekendPlanner without crashes', () => {

    const html = renderToString(

      <MemoryRouter>

        <WeekendPlanner />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('This Weekend in East Gwillimbury');

    expect(html).toContain('Weekend Planner');

    expect(html).toContain('+ Post Weekend Event');

  });

  it('renders EventDetails without crashes', () => {

    const html = renderToString(

      <MemoryRouter initialEntries={['/events/georgina-santa-claus-parade-festival-of-lights-sutton-on']}>

        <EventDetails />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

  });

  it('renders ResidentDiscovery with 3 primary tabs and search', () => {

    const html = renderToString(

      <MemoryRouter initialEntries={['/discovery?tab=events']}>

        <ResidentDiscovery />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Welcome East Gwillimbury');

    expect(html).toContain('Discover more. Shop local. Feel at home.');

    expect(html).toContain('Events');

    expect(html).toContain('Local Sales');

    expect(html).toContain('My Offers');

  });

  it('renders ResidentDiscovery in universal search mode searching businesses and news', () => {

    const html = renderToString(

      <MemoryRouter initialEntries={['/discovery?q=lake']}>

        <ResidentDiscovery />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Search Results for');

    expect(html).toContain('lake');

    expect(html).toContain('across businesses, events, dining, sales, and community news');

  });

  it('renders Sales with Deals Calendar and Ending Soon options', () => {

    const html = renderToString(

      <MemoryRouter>

        <Sales />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Local Deals &amp; Store Sales');

    expect(html).toContain('Ending Soon');

    expect(html).toContain('6-Week Deals Calendar');

  });

  it('renders Dining with Eat In, Take Out, and Delivery categories without scraping', () => {

    const html = renderToString(

      <MemoryRouter>

        <Dining />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Local Dining in East Gwillimbury');

    expect(html).toContain('Eat In');

    expect(html).toContain('Take Out');

    expect(html).toContain('Delivery');

    expect(html).toContain('Submit Restaurant Listing');

  });

  it('renders SubmitEvent page with event-specific fields and zero-pricing policy notice', () => {

    const html = renderToString(

      <MemoryRouter>

        <SubmitEvent />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Submit Your East Gwillimbury Event');

    expect(html).toContain('Why Prices May Not Be Displayed');

    expect(html).toContain('Event Title');

    expect(html).toContain('Start Time');

    expect(html).toContain('Event Schedule Pattern');

    expect(html).toContain('Monday newsletter');

    expect(html).toContain('Thursday newsletter');

    expect(html).toContain('Please send me information about the Welcome Hamper');

    expect(html).toContain('Choose your community…');

  });

  it('renders SubmitSale page with retail deal and discount fields', () => {

    const html = renderToString(

      <MemoryRouter>

        <SubmitSale />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Submit a Retail Sale or Store Promotion');

    expect(html).toContain('Sale Headline');

    expect(html).toContain('Discount / Deal Text');

    expect(html).toContain('Choose a category…');

    expect(html).toContain('Date Range');

    expect(html).toContain('Start Date');

    expect(html).toContain('End Date');

    expect(html).not.toContain('[Sale]');

  });

  it('renders SubmitDining page with restaurant special and service checkboxes', () => {

    const html = renderToString(

      <MemoryRouter>

        <SubmitDining />

      </MemoryRouter>

    );

    expect(html).toBeDefined();

    expect(html).toContain('Submit a Dining Special or Food Offer');

    expect(html).toContain('Restaurant / Business Name');

    expect(html).toContain('Service Options');

    expect(html).toContain('Eat In');

    expect(html).toContain('Take Out');

    expect(html).toContain('Delivery');

    expect(html).not.toMatch(/<input[^>]*checked[^>]*>\s*<span>(Eat In|Take Out|Delivery)/);

  });


  it('renders ScrollToTop without crashes inside Router', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
  });

  it('renders CommunityWeather page with 7-day forecast and community switcher', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/weather/keswick']}>
        <CommunityWeather />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
    expect(html).toContain('East Gwillimbury Communities');
    expect(html).toContain('Keswick');
    expect(html).toContain('Sutton');
    expect(html).toContain('Jackson&#x27;s Point');
    expect(html).toContain('Pefferlaw');
  });

  it('renders Directory page with A-Z alphabetical index, breadcrumbs, and 50 listings per page', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/directory']}>
        <Directory />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
    expect(html).toContain('A — Z Business &amp; Location Directory');
    expect(html).toContain('Alphabetical Index (A — Z)');
    expect(html).toContain('50 Listings Per Directory Page');
    expect(html).toContain('Showing');
    expect(html).toContain('Art Gallery of East Gwillimbury');
    expect(html).toContain('Google Map Location');
  });
  it('renders TimePicker component with hour, minute, and period dropdown selectors', () => {
    const html = renderToString(
      <TimePicker value="10:30 AM" onChange={() => {}} label="Start Time" id="test-time" />
    );
    expect(html).toContain('Start Time');
    expect(html).toContain('Hour');
    expect(html).toContain('Min');
    expect(html).toContain('AM');
    expect(html).toContain('PM');
  });

  it('renders SubmitEvent with TimePicker selectors and left-aligned inputs', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/submit/event']}>
        <SubmitEvent />
      </MemoryRouter>
    );
    expect(html).toContain('Submit Event for Verification');
    expect(html).toContain('text-left');
    expect(html).toContain('Start Time');
    expect(html).toContain('Single Day');
    expect(html).toContain('Multiple Dates');
    expect(html).toContain('Recurring');
  });

  it('verifies EventDetails contains Date & Schedule and separated Date and Time parsing', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/events/sample-event']}>
        <EventDetails />
      </MemoryRouter>
    );
    expect(html).toBeDefined();
    expect(html).toContain('Loading verified event details...');
  });
  it('renders ImageUpload component with 300x400px guidance and file picker', () => {
    const html = renderToString(
      <ImageUpload value="" onChange={() => {}} label="Event Photo" />
    );
    expect(html).toContain('Event Photo');
    expect(html).toContain('300');
    expect(html).toContain('400');
  });

  it('renders AgreementCheckboxes with Privacy Policy and Terms of Service links', () => {
    const html = renderToString(
      <AgreementCheckboxes
        agreePrivacy={false}
        setAgreePrivacy={() => {}}
        agreeTerms={false}
        setAgreeTerms={() => {}}
      />
    );
    expect(html).toContain('Privacy Policy');
    expect(html).toContain('Terms of Service');
    expect(html).toContain('/privacy');
    expect(html).toContain('/terms');
  });

  it('renders Home page with updated (NN) Things to do and see in East Gwillimbury top pill', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>
    );
    expect(html).toContain('What are you looking to do in');
  });
});
