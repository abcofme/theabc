Add-Type -AssemblyName System.Drawing;
$files = Get-ChildItem -Path "c:\abc\theabc\backend\resources\images\*.png";
foreach ($f in $files) {
    $img = [System.Drawing.Image]::FromFile($f.FullName);
    $newName = $f.FullName -replace '\.png$', '.jpg';
    $img.Save($newName, [System.Drawing.Imaging.ImageFormat]::Jpeg);
    $img.Dispose();
    Remove-Item $f.FullName;
}
