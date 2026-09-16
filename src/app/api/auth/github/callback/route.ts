export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return Response.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  const clientId = process.env['GITHUB_CLIENT_ID'];
  const clientSecret = process.env['GITHUB_CLIENT_SECRET'];

  try {
    // 1. Exchange code for GitHub Access Token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Failed to exchange token');
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch authenticated GitHub user details
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'JARVIS-KARE-Agent',
      },
    });

    const userData = await userResponse.json();

    // 3. Return HTML script to store tokens in client localStorage and close OAuth window/redirect
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head><title>GitHub Authentication Successful</title></head>
        <body style="background:#090d16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
          <script>
            localStorage.setItem('jarvis_github_oauth_token', '${accessToken}');
            localStorage.setItem('jarvis_github_user', '${userData.login}');
            window.location.href = '/';
          </script>
          <p>GitHub connected successfully! Redirecting back to JARVIS...</p>
        </body>
      </html>
    `;

    return new Response(htmlResponse, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: any) {
    return Response.json({ error: err instanceof Error ? err.message : 'GitHub authentication failed' }, { status: 500 });
  }
}
