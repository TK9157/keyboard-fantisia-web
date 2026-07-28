param(
    [int]$Port = 8080
)

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "Server running at $prefix"
    Write-Host "Press Ctrl+C to stop."

    $root = (Get-Item -Path ".\").FullName

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") { $urlPath = "/index.html" }
        $filePath = Join-Path -Path $root -ChildPath $urlPath.TrimStart('/')
        
        # Security: ensure file path is within root
        $fullPath = (Get-Item -LiteralPath $filePath -ErrorAction SilentlyContinue).FullName
        
        if ($null -ne $fullPath -and $fullPath.StartsWith($root) -and (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $mimeType = "application/octet-stream"
            
            switch ($ext) {
                ".html" { $mimeType = "text/html" }
                ".css"  { $mimeType = "text/css" }
                ".js"   { $mimeType = "application/javascript" }
                ".json" { $mimeType = "application/json" }
                ".png"  { $mimeType = "image/png" }
                ".jpg"  { $mimeType = "image/jpeg" }
                ".jpeg" { $mimeType = "image/jpeg" }
                ".gif"  { $mimeType = "image/gif" }
                ".svg"  { $mimeType = "image/svg+xml" }
                ".ico"  { $mimeType = "image/x-icon" }
                ".mp3"  { $mimeType = "audio/mpeg" }
                ".mp4"  { $mimeType = "video/mp4" }
            }

            $response.ContentType = $mimeType
            
            try {
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.StatusCode = 200
            } catch {
                $response.StatusCode = 500
                Write-Host "Error reading file: $fullPath" -ForegroundColor Red
            }
        } else {
            $response.StatusCode = 404
            Write-Host "404 Not Found: $urlPath" -ForegroundColor Yellow
        }
        
        $response.Close()
    }
} catch {
    Write-Host "Error starting server: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
}
