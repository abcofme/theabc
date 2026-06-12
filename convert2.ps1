Add-Type -AssemblyName System.Drawing;
$files = 'личность.png', 'самооценка.png', 'темперамент.png', 'общительность.png', 'профориентация.png';
foreach ($f in $files) {
    $path = "c:\abc\theabc\backend\resources\images\$f";
    if (Test-Path $path) {
        $img = [System.Drawing.Image]::FromFile($path);
        $newName = $path -replace '\.png$', '.jpg';
        $img.Save($newName, [System.Drawing.Imaging.ImageFormat]::Jpeg);
        $img.Dispose();
        Remove-Item $path;
    }
}
