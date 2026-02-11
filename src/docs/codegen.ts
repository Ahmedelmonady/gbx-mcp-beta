import type { ApiEndpoint } from '../shared/types.js';
import type { CodeLanguage } from './types.js';
import { DEFAULT_BASE_URL } from '../shared/github-cache.js';

/** Generates a code example for an API endpoint in the specified language */
export function generateCode(ep: ApiEndpoint, lang: CodeLanguage, body?: string): string {
  const baseUrl = (process.env.GAMEBALL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = process.env.GAMEBALL_API_KEY || '{{your-api-key}}';
  const secretKey = process.env.GAMEBALL_SECRET_KEY || '{{your-secret-key}}';
  const url = `${baseUrl}${ep.path}`;
  const hasBody = ep.method !== 'GET' && body;

  switch (lang) {
    case 'curl':
      return [
        `curl -X ${ep.method} "${url}"`,
        `  -H "APIKey: ${apiKey}"`,
        `  -H "SecretKey: ${secretKey}"`,
        hasBody ? `  -H "Content-Type: application/json"` : null,
        hasBody ? `  -d '${body}'` : null,
      ].filter(Boolean).join(' \\\n');

    case 'javascript':
      return [
        `const response = await fetch("${url}", {`,
        `  method: "${ep.method}",`,
        `  headers: {`,
        `    "APIKey": "${apiKey}",`,
        `    "SecretKey": "${secretKey}"${hasBody ? ',' : ''}`,
        hasBody ? `    "Content-Type": "application/json"` : null,
        `  }${hasBody ? ',' : ''}`,
        hasBody ? `  body: JSON.stringify(${body})` : null,
        `});`,
        `const data = await response.json();`,
      ].filter(Boolean).join('\n');

    case 'python':
      return [
        `import requests`,
        ``,
        `response = requests.${ep.method.toLowerCase()}(`,
        `    "${url}",`,
        `    headers={`,
        `        "APIKey": "${apiKey}",`,
        `        "SecretKey": "${secretKey}"`,
        `    }${hasBody ? ',' : ''}`,
        hasBody ? `    json=${body}` : null,
        `)`,
        `data = response.json()`,
      ].filter(Boolean).join('\n');

    case 'csharp':
      return [
        `using var client = new HttpClient();`,
        `client.DefaultRequestHeaders.Add("APIKey", "${apiKey}");`,
        `client.DefaultRequestHeaders.Add("SecretKey", "${secretKey}");`,
        ``,
        hasBody
          ? [
              `var content = new StringContent(`,
              `    @"${body?.replace(/"/g, '""') ?? ''}", System.Text.Encoding.UTF8, "application/json");`,
              `var response = await client.${capitalize(ep.method.toLowerCase())}Async("${url}", content);`,
            ].join('\n')
          : `var response = await client.${capitalize(ep.method.toLowerCase())}Async("${url}");`,
        `var data = await response.Content.ReadAsStringAsync();`,
      ].filter(Boolean).join('\n');

    case 'go':
      return [
        `package main`,
        ``,
        `import (`,
        `    "fmt"`,
        `    "net/http"`,
        `    "io"`,
        hasBody ? `    "strings"` : null,
        `)`,
        ``,
        `func main() {`,
        hasBody
          ? `    body := strings.NewReader(\`${body}\`)`
          : null,
        hasBody
          ? `    req, _ := http.NewRequest("${ep.method}", "${url}", body)`
          : `    req, _ := http.NewRequest("${ep.method}", "${url}", nil)`,
        `    req.Header.Set("APIKey", "${apiKey}")`,
        `    req.Header.Set("SecretKey", "${secretKey}")`,
        hasBody ? `    req.Header.Set("Content-Type", "application/json")` : null,
        `    resp, _ := http.DefaultClient.Do(req)`,
        `    defer resp.Body.Close()`,
        `    data, _ := io.ReadAll(resp.Body)`,
        `    fmt.Println(string(data))`,
        `}`,
      ].filter(Boolean).join('\n');

    case 'php':
      return [
        `<?php`,
        `$ch = curl_init("${url}");`,
        `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
        `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${ep.method}");`,
        `curl_setopt($ch, CURLOPT_HTTPHEADER, [`,
        `    "APIKey: ${apiKey}",`,
        `    "SecretKey: ${secretKey}"${hasBody ? ',' : ''}`,
        hasBody ? `    "Content-Type: application/json"` : null,
        `]);`,
        hasBody ? `curl_setopt($ch, CURLOPT_POSTFIELDS, '${body}');` : null,
        `$response = curl_exec($ch);`,
        `curl_close($ch);`,
        `$data = json_decode($response, true);`,
      ].filter(Boolean).join('\n');

    case 'java':
      return [
        `import java.net.http.*;`,
        `import java.net.URI;`,
        ``,
        `var client = HttpClient.newHttpClient();`,
        `var request = HttpRequest.newBuilder()`,
        `    .uri(URI.create("${url}"))`,
        `    .header("APIKey", "${apiKey}")`,
        `    .header("SecretKey", "${secretKey}")`,
        hasBody
          ? `    .method("${ep.method}", HttpRequest.BodyPublishers.ofString("${body?.replace(/"/g, '\\"') ?? ''}"))`
          : `    .method("${ep.method}", HttpRequest.BodyPublishers.noBody())`,
        `    .build();`,
        `var response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
        `System.out.println(response.body());`,
      ].filter(Boolean).join('\n');
  }
}

/** Capitalizes the first character of a string */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
