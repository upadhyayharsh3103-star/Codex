const { Octokit } = require('@octokit/rest');
const { execSync } = require('child_process');

let connectionSettings;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X-REPLIT-TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings) {
    throw new Error('GitHub connection not found. Please ensure the GitHub integration is properly set up.');
  }

  const accessToken = connectionSettings.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function main() {
  const repoName = process.argv[2] || 'cloud-browser';
  const isPrivate = process.argv[3] === 'private';

  console.log('\n========================================');
  console.log('   Push Cloud Browser to GitHub');
  console.log('========================================\n');

  try {
    const octokit = await getUncachableGitHubClient();
    
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`Logged in as: ${user.login}`);
    console.log(`Creating repository: ${repoName}`);
    console.log(`Visibility: ${isPrivate ? 'private' : 'public'}\n`);

    let repo;
    try {
      const { data } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'Cloud-based browser accessible via VNC with profile management and mobile app support',
        private: isPrivate,
        auto_init: false
      });
      repo = data;
      console.log(`Repository created: ${repo.html_url}`);
    } catch (error) {
      if (error.status === 422) {
        console.log(`Repository '${repoName}' already exists. Using existing repository.`);
        const { data } = await octokit.repos.get({
          owner: user.login,
          repo: repoName
        });
        repo = data;
      } else {
        throw error;
      }
    }

    console.log('\nPreparing local repository...');
    
    const accessToken = await getAccessToken();
    
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch {
      console.log('Initializing git repository...');
      execSync('git init', { stdio: 'inherit' });
    }

    console.log('Setting up remote...');
    try {
      execSync('git remote remove origin', { stdio: 'ignore' });
    } catch {}

    const remoteUrl = `https://${accessToken}@github.com/${user.login}/${repoName}.git`;
    execSync(`git remote add origin "${remoteUrl}"`, { stdio: 'inherit' });

    console.log('Adding files...');
    execSync('git add -A', { stdio: 'inherit' });

    console.log('Creating commit...');
    try {
      execSync('git commit -m "Initial commit: Cloud Browser with mobile app support"', { stdio: 'inherit' });
    } catch {
      console.log('No new changes to commit (files may already be committed)');
    }

    console.log('Pushing to GitHub...');
    try {
      execSync('git branch -M main', { stdio: 'ignore' });
    } catch {}
    
    execSync('git push -u origin main --force', { stdio: 'inherit' });

    console.log('\n========================================');
    console.log('   SUCCESS!');
    console.log('========================================');
    console.log(`\nYour code is now on GitHub!`);
    console.log(`Repository URL: ${repo.html_url}`);
    console.log(`\nNext steps:`);
    console.log(`1. Visit ${repo.html_url} to see your code`);
    console.log(`2. Deploy to Render.com using the included render.yaml`);
    console.log(`3. Build the mobile app using the mobile-app folder`);
    console.log(`4. Share your repository with others!`);

  } catch (error) {
    console.error('\nError:', error.message);
    if (error.status === 401) {
      console.log('GitHub authentication failed. Please reconnect your GitHub account.');
    }
  }
}

main();
