import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/button/Button';
import './LandingPage.scss';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header>
        <img src="/logo.png" alt="interview.ai logo" />
        <h1>interview.ai</h1>
      </header>
      <main>
        <h2>Turn Your Interview into a Book</h2>
        <p>
          Engage in a deep, meaningful interview with our AI. As you talk, we learn about you,
          your thoughts, and your experiences. When you're ready, we'll transform your interview
          into a published book on Amazon with just one click.
        </p>
        <Link to="/console">
          <Button label="Start Your Interview" buttonStyle="action" />
        </Link>
      </main>
      <footer>
        <p>© 2024 interview.ai. All rights reserved.</p>
      </footer>
    </div>
  );
}
