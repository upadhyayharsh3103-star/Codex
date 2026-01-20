const { GoogleGenAI } = require('@google/genai');

class GeminiAgent {
  constructor() {
    this.defaultApiKey = process.env.GEMINI_API_KEY || '';
    this.userApiKeys = new Map();
  }

  setUserApiKey(userId, apiKey) {
    this.userApiKeys.set(userId, apiKey);
  }

  getUserApiKey(userId) {
    return this.userApiKeys.get(userId) || this.defaultApiKey;
  }

  removeUserApiKey(userId) {
    this.userApiKeys.delete(userId);
  }

  hasApiKey(userId) {
    return this.userApiKeys.has(userId) || !!this.defaultApiKey;
  }

  getClient(userId) {
    const apiKey = this.getUserApiKey(userId);
    if (!apiKey) {
      throw new Error('No Gemini API key configured. Please add your Google API key in settings.');
    }
    return new GoogleGenAI({ apiKey });
  }

  async chat(userId, message, context = {}) {
    const ai = this.getClient(userId);
    
    const systemPrompt = `You are a helpful AI assistant integrated into a Cloud Browser application. 
You help users customize and configure their cloud browser experience.
You can provide suggestions for:
- Browser settings and preferences
- Profile management tips
- Storage optimization
- Auto-save configuration
- General browsing tips

Current context:
${JSON.stringify(context, null, 2)}

Be concise, helpful, and friendly. If asked about customizations, provide actionable suggestions.`;

    try {
      const response = await this.retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: message,
          config: {
            systemInstruction: systemPrompt
          }
        });
      });

      return {
        success: true,
        response: response.text || 'I apologize, but I could not generate a response.',
        model: 'gemini-2.5-flash'
      };
    } catch (error) {
      console.error('Gemini chat error:', error);
      return {
        success: false,
        error: this.formatErrorMessage(error)
      };
    }
  }

  formatErrorMessage(error) {
    const message = error.message || '';
    const status = error.status || 0;
    
    // Handle server overload (503)
    if (status === 503 || message.includes('503') || message.includes('overloaded') || message.includes('UNAVAILABLE')) {
      return 'The AI service is currently overloaded. Please wait a moment and try again.';
    }
    
    // Handle quota exceeded errors
    if (status === 429 || message.includes('429') || message.includes('quota') || message.includes('Quota exceeded')) {
      return 'The AI service is temporarily busy due to high usage. Please wait a moment and try again.';
    }
    
    // Handle rate limiting
    if (message.includes('rate') || message.includes('limit')) {
      return 'Too many requests. Please wait a few seconds and try again.';
    }
    
    // Handle invalid API key
    if (status === 401 || message.includes('401') || message.includes('API key') || message.includes('authentication')) {
      return 'Invalid API key. Please check your API key in the Settings tab.';
    }
    
    // Handle model not found
    if (status === 404 || message.includes('404') || message.includes('not found') || message.includes('NOT_FOUND')) {
      return 'AI model temporarily unavailable. Please try again later.';
    }
    
    // Handle network errors
    if (message.includes('network') || message.includes('ECONNREFUSED') || message.includes('timeout')) {
      return 'Connection error. Please check your internet and try again.';
    }
    
    // Default fallback - provide a clean message
    return 'Unable to get a response from the AI. Please try again.';
  }

  async retryWithBackoff(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        const status = error.status || 0;
        if ((status === 503 || status === 429) && i < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 8000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  }

  async suggestCustomizations(userId, currentSettings = {}) {
    const ai = this.getClient(userId);

    const prompt = `Based on these current Cloud Browser settings, suggest 3-5 helpful customizations:

Current Settings:
${JSON.stringify(currentSettings, null, 2)}

Provide suggestions in JSON format:
{
  "suggestions": [
    {
      "title": "Short title",
      "description": "Brief description of the suggestion",
      "action": "specific action to take",
      "priority": "high|medium|low"
    }
  ]
}`;

    try {
      const response = await this.retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      });

      const text = response.text;
      if (text) {
        return {
          success: true,
          suggestions: JSON.parse(text).suggestions
        };
      }
      return {
        success: false,
        error: 'Empty response from AI'
      };
    } catch (error) {
      console.error('Gemini suggestions error:', error);
      return {
        success: false,
        error: this.formatErrorMessage(error)
      };
    }
  }

  async analyzeUsage(userId, usageData = {}) {
    const ai = this.getClient(userId);

    const prompt = `Analyze this Cloud Browser usage data and provide insights:

Usage Data:
${JSON.stringify(usageData, null, 2)}

Provide analysis in JSON format:
{
  "insights": [
    {
      "category": "storage|performance|security|usage",
      "finding": "What you observed",
      "recommendation": "What to do about it"
    }
  ],
  "overallScore": 1-10,
  "summary": "Brief overall summary"
}`;

    try {
      const response = await this.retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      });

      const text = response.text;
      if (text) {
        return {
          success: true,
          analysis: JSON.parse(text)
        };
      }
      return {
        success: false,
        error: 'Empty response from AI'
      };
    } catch (error) {
      console.error('Gemini analysis error:', error);
      return {
        success: false,
        error: this.formatErrorMessage(error)
      };
    }
  }

  async validateApiKey(apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Say "OK" if you can read this.'
      });
      return {
        valid: true,
        message: 'API key is valid'
      };
    } catch (error) {
      return {
        valid: false,
        message: this.formatErrorMessage(error)
      };
    }
  }
}

module.exports = GeminiAgent;
