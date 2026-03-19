import { useState } from 'react';
import { layoutTemplates, selectTemplate } from '../utils/layoutTemplates';
import type { AspectRatioType } from '../utils/layoutTemplates';
import { useTheme } from '../context/ThemeContext';

interface MakeTestPanelProps {
  isDarkMode?: boolean;
}

export function MakeTestPanel({ isDarkMode: propDarkMode }: MakeTestPanelProps) {
  const { isDarkMode: themeDarkMode } = useTheme();
  const isDarkMode = propDarkMode !== undefined ? propDarkMode : themeDarkMode;

  const [hookAngle, setHookAngle] = useState('before-after');
  const [emotionalDriver, setEmotionalDriver] = useState('aspiration');
  const [adFormat, setAdFormat] = useState('static image');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('1:1');
  const [headline, setHeadline] = useState('Transform Your Look in 30 Days');
  const [bodyText, setBodyText] = useState('Real results from real people. No BS ingredients, just results.');
  const [ctaText, setCtaText] = useState('See Results');
  const [accentColor, setAccentColor] = useState('#ff6b35');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [textColor, setTextColor] = useState('#1a1a1a');
  const [fontFamily, setFontFamily] = useState('system');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Template-specific fields
  const [heroImageUrl, setHeroImageUrl] = useState('[HERO_IMAGE_URL]');
  const [beforeImageUrl, setBeforeImageUrl] = useState('[BEFORE_IMAGE_URL]');
  const [afterImageUrl, setAfterImageUrl] = useState('[AFTER_IMAGE_URL]');
  const [feature1, setFeature1] = useState('High quality ingredients');
  const [feature2, setFeature2] = useState('Proven results');
  const [feature3, setFeature3] = useState('Money-back guarantee');
  const [quote, setQuote] = useState('This changed my life');
  const [authorName, setAuthorName] = useState('Sarah M.');
  const [authorRole, setAuthorRole] = useState('Customer');

  const hookAngles = [
    'pain-agitate-solution',
    'social-proof',
    'before-after',
    'curiosity',
    'authority',
    'urgency',
    'lifestyle',
    'scarcity',
    'exclusivity',
  ];

  const emotions = ['fear-of-failure', 'aspiration', 'social-belonging', 'identity', 'urgency', 'fomo', 'status'];
  const formats = ['static image', 'carousel', 'video testimonial'];

  // Generate contextual copy based on hook angle + emotion
  const generateContextualCopy = (angle: string, emotion: string) => {
    const copyMap: Record<string, Record<string, { headline: string; body: string; cta: string }>> = {
      'pain-agitate-solution': {
        'fear-of-failure': {
          headline: 'Stop Wasting Money on Products That Don\'t Work',
          body: 'Tired of trying everything? Most people spend months and hundreds of dollars before finding real results. Don\'t be that person.',
          cta: 'Get Real Results Now'
        },
        'aspiration': {
          headline: 'Finally Get the Results You\'ve Always Wanted',
          body: 'Imagine waking up feeling confident. That\'s what our customers experience within weeks.',
          cta: 'Start Your Transformation'
        },
        'urgency': {
          headline: 'Your Best Self Is Waiting (Restocks Selling Out)',
          body: 'Limited batches, high demand. People are finally getting what they\'ve been searching for.',
          cta: 'Claim Yours Before They\'re Gone'
        }
      },
      'social-proof': {
        'social-belonging': {
          headline: '47K+ People Are Already Seeing Results',
          body: 'Join the community that\'s transforming together. Real people. Real results. Real support.',
          cta: 'Join the Movement'
        },
        'aspiration': {
          headline: 'What Top 1% of Our Customers Are Doing',
          body: 'They didn\'t just buy a product. They invested in becoming their best selves.',
          cta: 'See What They\'re Doing'
        },
        'fomo': {
          headline: 'The Only Supplement Everyone\'s Talking About',
          body: 'If you haven\'t tried it yet, you\'re missing out. Health coaches, athletes, creators—all using it.',
          cta: 'Get In Before It\'s Everywhere'
        }
      },
      'before-after': {
        'aspiration': {
          headline: 'Transform Your Look in 30 Days',
          body: 'Real results from real people. See the difference proven formula can make.',
          cta: 'See Before & After'
        },
        'social-belonging': {
          headline: 'Look Like You\'ve Joined a Secret Club',
          body: 'When people ask what you\'re doing different, you\'ll know. They\'ll see it.',
          cta: 'Start the Transformation'
        },
        'identity': {
          headline: 'Become the Version of Yourself You Know You Can Be',
          body: 'It\'s not about looking different. It\'s about feeling like yourself again.',
          cta: 'Reclaim Your Confidence'
        }
      },
      'curiosity': {
        'fomo': {
          headline: 'This Ingredient Is Banned in 12 Countries (But Legal Here)',
          body: 'Scientists discovered something remarkable. We put it in a formula. Results speak for themselves.',
          cta: 'Discover What\'s Inside'
        },
        'aspiration': {
          headline: 'What Biohackers Don\'t Want You to Know',
          body: 'One simple tweak to your routine changes everything. We\'re breaking the silence.',
          cta: 'Learn the Secret'
        }
      },
      'authority': {
        'identity': {
          headline: 'Trusted by 500+ Healthcare Professionals',
          body: 'Dermatologists, nutritionists, and wellness experts recommend it. Now you know why.',
          cta: 'Join Experts\' Choice'
        },
        'aspiration': {
          headline: 'The Science Behind the Results',
          body: 'Backed by 15 years of research. Proven in clinical trials. Trusted by experts.',
          cta: 'See the Science'
        }
      },
      'urgency': {
        'fear-of-failure': {
          headline: '72-Hour Flash Sale: Up to 50% Off',
          body: 'This price won\'t last. In 72 hours, it goes back to full price.',
          cta: 'Grab It Before Midnight'
        },
        'fomo': {
          headline: 'Limited Stock Alert: Only 23 Left',
          body: 'Fast movers get them. Slow browsers miss out. What will you do?',
          cta: 'Secure Yours Now'
        }
      },
      'lifestyle': {
        'aspiration': {
          headline: 'Live Your Best Life Starting Today',
          body: 'Imagine a day where you feel amazing. More energy. More confidence. More you.',
          cta: 'Start Living Better'
        },
        'social-belonging': {
          headline: 'Be Part of the Wellness Movement',
          body: 'Self-care isn\'t selfish. It\'s how you show up as your best self for others.',
          cta: 'Join the Community'
        }
      },
      'scarcity': {
        'fomo': {
          headline: 'Only Available for 48 More Hours',
          body: 'We make limited batches to maintain quality. This drop ends tomorrow.',
          cta: 'Don\'t Miss Your Chance'
        },
        'urgency': {
          headline: 'Last Chance: Final 12 Units',
          body: 'Once they\'re gone, that\'s it. Next batch drops in Q2.',
          cta: 'Get Yours Before It\'s Too Late'
        }
      },
      'exclusivity': {
        'status': {
          headline: 'VIP Access: The Premium Formula',
          body: 'Not for everyone. For people who refuse to settle. Premium quality. Premium results.',
          cta: 'Get VIP Access'
        },
        'identity': {
          headline: 'For Those Who Know Better',
          body: 'You didn\'t get here by making average choices. Why start now?',
          cta: 'Claim Your Status'
        }
      }
    };

    const defaultCopy = {
      headline: 'Experience the Difference',
      body: 'Discover what real results look like. Our customers don\'t just buy once—they become advocates.',
      cta: 'Learn More'
    };

    return copyMap[angle]?.[emotion] || defaultCopy;
  };

  const handleGenerateWithContext = () => {
    const contextualCopy = generateContextualCopy(hookAngle, emotionalDriver);
    setHeadline(contextualCopy.headline);
    setBodyText(contextualCopy.body);
    setCtaText(contextualCopy.cta);
  };

  const fontFamilyMap: Record<string, string> = {
    'system': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'serif': '"Georgia", serif',
    'mono': '"Monaco", "Courier New", monospace',
    'geometric': '"Montserrat", "Helvetica Neue", sans-serif',
    'script': '"Playfair Display", serif',
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    try {
      // Select template based on hook angle + format
      const templateKey = selectTemplate(hookAngle, adFormat);
      const templateFn = layoutTemplates[templateKey];

      if (!templateFn) {
        alert('Template not found for this combination');
        setIsGenerating(false);
        return;
      }

      const fontFamilyValue = fontFamilyMap[fontFamily] || fontFamilyMap['system'];

      let html = '';

      if (templateKey === 'heroCTA') {
        html = layoutTemplates.heroCTA({
          heroImageUrl: '[HERO_IMAGE_URL]',
          headline,
          bodyText,
          ctaText,
          backgroundColor,
          accentColor,
          textColor,
          fontFamily: fontFamilyValue,
          aspectRatio,
        });
      } else if (templateKey === 'features3Column') {
        const features = bodyText.split('\n').slice(0, 3);
        html = layoutTemplates.features3Column({
          headline,
          feature1: features[0] || 'Feature 1',
          feature2: features[1] || 'Feature 2',
          feature3: features[2] || 'Feature 3',
          ctaText,
          accentColor,
          backgroundColor,
          textColor,
          fontFamily: fontFamilyValue,
          aspectRatio,
        });
      } else if (templateKey === 'beforeAfter') {
        html = layoutTemplates.beforeAfter({
          headline,
          beforeImageUrl: '[BEFORE_IMAGE_URL]',
          afterImageUrl: '[AFTER_IMAGE_URL]',
          beforeLabel: 'BEFORE',
          afterLabel: 'AFTER',
          ctaText,
          accentColor,
          backgroundColor,
          textColor,
          fontFamily: fontFamilyValue,
          aspectRatio,
        });
      } else if (templateKey === 'testimonial') {
        html = layoutTemplates.testimonial({
          quote: bodyText,
          authorName: 'Customer Name',
          authorRole: 'Role / Location',
          result: headline,
          ctaText,
          accentColor,
          backgroundColor,
          textColor,
          fontFamily: fontFamilyValue,
          aspectRatio,
        });
      }

      setGeneratedHtml(html);
    } catch (error) {
      console.error('Error generating layout:', error);
      alert('Error generating layout: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const bgClass = isDarkMode ? 'bg-transparent' : 'bg-zinc-50';
  const inputBgClass = isDarkMode ? 'bg-white/[0.03] border-white/[0.08] text-white/[0.85]' : 'bg-white border-zinc-300 text-black';
  const labelClass = isDarkMode ? 'text-white/[0.55]' : 'text-zinc-700';
  const borderClass = isDarkMode ? 'border-white/[0.08]' : 'border-zinc-300';

  if (generatedHtml) {
    return (
      <div className={`${bgClass} p-6 space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-mono font-bold text-sm uppercase ${isDarkMode ? 'text-white' : 'text-black'}`}>
            Generated Layout Preview
          </h3>
          <button
            onClick={() => setGeneratedHtml(null)}
            className={`px-3 py-1 text-xs font-mono uppercase ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-200 hover:bg-zinc-300 text-black'}`}
          >
            Back
          </button>
        </div>

        <div className={`border ${borderClass} p-4 max-h-96 overflow-y-auto`}>
          <iframe
            srcDoc={generatedHtml}
            className="w-full border-0"
            style={{ minHeight: '400px' }}
            title="Generated Ad Layout"
          />
        </div>

        <details className={`border ${borderClass} p-3`}>
          <summary className={`cursor-pointer font-mono text-xs uppercase font-semibold ${labelClass}`}>
            View HTML Source
          </summary>
          <pre className={`mt-3 p-3 ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'} overflow-x-auto text-[10px] rounded`}>
            {generatedHtml}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className={`${bgClass} p-6 space-y-4`}>
      <h3 className={`font-mono font-bold text-sm uppercase ${isDarkMode ? 'text-white' : 'text-black'}`}>
        Quick Test: Generate Layout
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Hook Angle</label>
          <select
            value={hookAngle}
            onChange={(e) => setHookAngle(e.target.value)}
            className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          >
            {hookAngles.map((angle) => (
              <option key={angle} value={angle}>
                {angle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Emotional Driver</label>
          <select
            value={emotionalDriver}
            onChange={(e) => setEmotionalDriver(e.target.value)}
            className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          >
            {emotions.map((emotion) => (
              <option key={emotion} value={emotion}>
                {emotion}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Ad Format</label>
          <select
            value={adFormat}
            onChange={(e) => setAdFormat(e.target.value)}
            className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          >
            {formats.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatioType)}
            className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          >
            <option value="1:1">1:1 (Square)</option>
            <option value="4:5">4:5 (Tall)</option>
            <option value="9:16">9:16 (Mobile)</option>
            <option value="16:9">16:9 (Landscape)</option>
          </select>
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Accent Color</label>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className={`w-full h-8 border rounded cursor-pointer ${borderClass}`}
          />
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Background Color</label>
          <input
            type="color"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className={`w-full h-8 border rounded cursor-pointer ${borderClass}`}
          />
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Text Color</label>
          <input
            type="color"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            className={`w-full h-8 border rounded cursor-pointer ${borderClass}`}
          />
        </div>

        <div>
          <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Font Family</label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          >
            <option value="system">System Default</option>
            <option value="serif">Serif (Classic)</option>
            <option value="mono">Monospace</option>
            <option value="geometric">Geometric (Montserrat)</option>
            <option value="script">Script (Playfair)</option>
          </select>
        </div>
      </div>

      <div>
        <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Headline</label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          placeholder="Enter headline text..."
        />
      </div>

      {/* Template-specific fields */}
      {adFormat !== 'static image' && (
        <div className={`border-t ${borderClass} pt-4 mt-4`}>
          <p className={`text-xs font-mono font-semibold mb-3 ${labelClass}`}>Template-Specific Fields</p>

          {/* Hero/Features/Testimonial fields */}
          {selectTemplate(hookAngle, adFormat) === 'heroCTA' && (
            <div>
              <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Hero Image URL</label>
              <input
                type="text"
                value={heroImageUrl}
                onChange={(e) => setHeroImageUrl(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
                placeholder="[HERO_IMAGE_URL]"
              />
            </div>
          )}

          {selectTemplate(hookAngle, adFormat) === 'features3Column' && (
            <div className="space-y-2">
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Feature 1</label>
                <input type="text" value={feature1} onChange={(e) => setFeature1(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Feature 2</label>
                <input type="text" value={feature2} onChange={(e) => setFeature2(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Feature 3</label>
                <input type="text" value={feature3} onChange={(e) => setFeature3(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
            </div>
          )}

          {selectTemplate(hookAngle, adFormat) === 'beforeAfter' && (
            <div className="space-y-2">
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Before Image URL</label>
                <input type="text" value={beforeImageUrl} onChange={(e) => setBeforeImageUrl(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>After Image URL</label>
                <input type="text" value={afterImageUrl} onChange={(e) => setAfterImageUrl(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
            </div>
          )}

          {selectTemplate(hookAngle, adFormat) === 'testimonial' && (
            <div className="space-y-2">
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Quote</label>
                <textarea value={quote} onChange={(e) => setQuote(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded h-12 resize-none ${inputBgClass}`} />
              </div>
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Author Name</label>
                <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
              <div>
                <label className={`block text-xs font-mono font-semibold mb-1 ${labelClass}`}>Author Role</label>
                <input type="text" value={authorRole} onChange={(e) => setAuthorRole(e.target.value)} className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`} />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>Body Text</label>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className={`w-full px-3 py-1.5 text-xs border rounded h-16 resize-none ${inputBgClass}`}
          placeholder="Enter body text..."
        />
      </div>

      <div>
        <label className={`block text-xs font-mono font-semibold mb-1.5 ${labelClass}`}>CTA Button Text</label>
        <input
          type="text"
          value={ctaText}
          onChange={(e) => setCtaText(e.target.value)}
          className={`w-full px-3 py-1.5 text-xs border rounded ${inputBgClass}`}
          placeholder="Enter button text..."
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleGenerateWithContext}
          className={`flex-1 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wide transition-all border rounded ${
            isDarkMode
              ? 'border-blue-800 text-blue-400 hover:border-blue-600 hover:text-blue-300 hover:bg-blue-950/30'
              : 'border-blue-300 text-blue-600 hover:border-blue-500'
          }`}
        >
          Auto-Fill Copy
        </button>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`flex-1 px-4 py-2.5 font-mono text-sm font-semibold uppercase tracking-wide transition-all ${
            isGenerating
              ? `${isDarkMode ? 'bg-zinc-700 text-zinc-500' : 'bg-zinc-300 text-zinc-500'} cursor-not-allowed`
              : `${isDarkMode ? 'bg-white text-black hover:bg-zinc-100' : 'bg-black text-white hover:bg-zinc-900'}`
          }`}
        >
          {isGenerating ? 'Generating...' : 'Generate Layout'}
        </button>
      </div>
    </div>
  );
}
