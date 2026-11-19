using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Jellyfin.Database.Implementations.Entities;
using Microsoft.Extensions.Logging;

// Request text must not forge lines in the server log.
//
// A header such as Device="x%0A[INF] fake line" is URL-decoded by the header parser, so it
// reaches the provider as a real newline, and Jellyfin writes log arguments raw. Anyone who
// can reach the sign-in path could add lines to the log. This drives the PIN provider with a
// device id and a username that carry line breaks, through a logger that keeps what it is
// given, and asserts that no message holds a line break afterwards. Each case also asserts
// that it logged something, so a refusal that stops logging cannot pass for a fix.
//
// tests/js/logforge.js is the guard that scans every Log call; this one proves the
// behaviour on the path that is reachable without a signed-in user.
//
// Usage: dotnet run -c Release   (loads bin/Release/<tfm>/Jellyfin.Profiles.dll)

int pass = 0;
var fails = new List<string>();
void Ok(string name, bool cond, string detail = null)
{
    if (cond) { pass++; Console.WriteLine("  PASS  " + name); }
    else
    {
        fails.Add(name + (detail is null ? "" : "  — " + detail));
        Console.WriteLine("  FAIL  " + name + (detail is null ? "" : "  — " + detail));
    }
}

static string RepoRoot()
{
    var d = AppContext.BaseDirectory;
    while (d != null && !File.Exists(Path.Combine(d, "Jellyfin.Profiles.csproj")))
        d = Path.GetDirectoryName(d.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
    return d ?? throw new Exception("could not find the repository root");
}

var tfm = new DirectoryInfo(AppContext.BaseDirectory.TrimEnd(
    Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)).Name;
var asm = Assembly.LoadFrom(Path.Combine(RepoRoot(), "bin", "Release", tfm, "Jellyfin.Profiles.dll"));
const BindingFlags Any = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;

var providerType = asm.GetType("Jellyfin.Profiles.Auth.BonfirePinAuthenticationProvider", true);
var pluginType = asm.GetType("Jellyfin.Profiles.Plugin", true);
var cfgType = asm.GetType("Jellyfin.Profiles.Configuration.PluginConfiguration", true);
var mappingType = asm.GetType("Jellyfin.Profiles.Configuration.ProfileMapping", true);
var knownType = asm.GetType("Jellyfin.Profiles.Configuration.KnownDevice", true);
var requestDevice = asm.GetType("Jellyfin.Profiles.Auth.RequestDevice", true);
var capture = requestDevice.GetMethod("Capture", BindingFlags.Public | BindingFlags.Static, new[] { typeof(string) });

var tempDir = Path.Combine(Path.GetTempPath(), "bonfire-logforge-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(tempDir);
var plugin = Activator.CreateInstance(pluginType, new StubPaths(tempDir), new StubXml());
var config = pluginType.GetProperty("Configuration", Any).GetValue(plugin);
cfgType.GetProperty("BonfireOn").SetValue(config, true);
cfgType.GetProperty("EnableClientPinLogin").SetValue(config, true);

var MASTER = Guid.NewGuid();
var KID = Guid.NewGuid();
var mappings = (IList)cfgType.GetProperty("Mappings").GetValue(config);
void Map(Guid profile, Guid master, string name)
{
    var m = Activator.CreateInstance(mappingType);
    mappingType.GetProperty("ProfileUserId").SetValue(m, profile);
    mappingType.GetProperty("MasterUserId").SetValue(m, master);
    mappingType.GetProperty("ProfileName").SetValue(m, name);
    // The main account has a PIN of its own, which is what the third case asks about.
    mappingType.GetProperty("PinHash").SetValue(m, profile == master
        ? (string)asm.GetType("Jellyfin.Profiles.Auth.PinHasher", true).GetMethod("Hash", Any).Invoke(null, new object[] { "9999" })
        : string.Empty);
    mappings.Add(m);
}
Map(MASTER, MASTER, "bard");
Map(KID, MASTER, "kids");

var devices = (IList)cfgType.GetProperty("KnownDevices").GetValue(config);
void Remember(string id, Guid owner)
{
    var d = Activator.CreateInstance(knownType);
    knownType.GetProperty("DeviceId").SetValue(d, id);
    knownType.GetProperty("MasterUserId").SetValue(d, owner);
    knownType.GetProperty("LastSeen").SetValue(d, DateTime.UtcNow);
    devices.Add(d);
}

var logType = typeof(CaptureLog<>).MakeGenericType(providerType);
var log = (ICaptureLog)Activator.CreateInstance(logType);
var provider = Activator.CreateInstance(providerType, log, null);

var authName = providerType.GetMethod("Authenticate", Any, null, new[] { typeof(string), typeof(string) }, null);
var authUser = providerType.GetMethod("Authenticate", Any, null, new[] { typeof(string), typeof(string), typeof(User) }, null);

void Try(Func<object> call)
{
    try { call(); } catch (TargetInvocationException) { } catch (Exception) { }
}

bool HasBreak(string s) => s.Any(c => char.IsControl(c) || c == '\u2028' || c == '\u2029');

void Case(string name, Action act)
{
    log.Lines.Clear();
    act();
    var lines = log.Lines.ToList();
    Ok(name + ": something was logged", lines.Count > 0);
    var bad = lines.Where(HasBreak).ToList();
    Ok(name + ": no logged message holds a line break", bad.Count == 0,
       bad.Count == 0 ? null : "got " + bad.Count + ", first: " + bad[0].Replace("\n", "\\n").Replace("\r", "\\r"));
    Ok(name + ": the request text is still in the log, cleaned",
       lines.Any(l => l.Contains("forged", StringComparison.Ordinal)));
}

Console.WriteLine();
Console.WriteLine("── Sign-in by name, from a device no household knows ──────────");
capture.Invoke(null, new object[] { "dev\r\n[INF] forged device" });
Case("unknown device, forged username", () =>
    Try(() => authName.Invoke(provider, new object[] { "kids\n[ERR] forged name", "" })));

Console.WriteLine();
Console.WriteLine("── Sign-in by name, from a device the household knows ─────────");
devices.Clear();
Remember("tv\n[INF] forged device", MASTER);
capture.Invoke(null, new object[] { "tv\n[INF] forged device" });
Case("known device, a name the household has no profile for", () =>
    Try(() => authName.Invoke(provider, new object[] { "ghost\u2028[WRN] forged name", "" })));

Console.WriteLine();
Console.WriteLine("── A PIN for the main account, from a device it has not used ──");
devices.Clear();
var master = new User("bard", "Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider",
                              "Jellyfin.Server.Implementations.Users.DefaultPasswordResetProvider");
typeof(User).GetProperty("Id").SetValue(master, MASTER);
capture.Invoke(null, new object[] { "other\n[INF] forged device" });
Case("main account PIN from an unknown device", () =>
    Try(() => authUser.Invoke(provider, new object[] { "bard", "1234", master })));

try { Directory.Delete(tempDir, true); } catch { }
Console.WriteLine();
if (fails.Count > 0)
{
    foreach (var f in fails) Console.WriteLine("   - " + f);
    Console.WriteLine(pass + " passed, " + fails.Count + " failed");
    return 1;
}
Console.WriteLine(pass + " passed, 0 failed");
return 0;

public interface ICaptureLog { List<string> Lines { get; } }

public sealed class CaptureLog<T> : ILogger<T>, ICaptureLog
{
    public List<string> Lines { get; } = new();
    public IDisposable BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception, Func<TState, Exception, string> formatter)
    {
        lock (Lines) Lines.Add(formatter(state, exception));
    }
}

sealed class StubPaths : MediaBrowser.Common.Configuration.IApplicationPaths
{
    private readonly string _root;
    public StubPaths(string root) { _root = root; }
    public string ProgramDataPath => _root;
    public string WebPath => _root;
    public string ProgramSystemPath => _root;
    public string DataPath => _root;
    public string ImageCachePath => _root;
    public string PluginsPath => _root;
    public string PluginConfigurationsPath => _root;
    public string LogDirectoryPath => _root;
    public string ConfigurationDirectoryPath => _root;
    public string SystemConfigurationFilePath => Path.Combine(_root, "system.xml");
    public string CachePath { get => _root; set { } }
    public string TempDirectory => _root;
    public string VirtualDataPath => _root;
    public string TrickplayPath => _root;
    public string BackupPath => _root;
    public void MakeSanityCheckOrThrow() { }
    public void CreateAndCheckMarker(string path, string markerName, bool recursive = false) { }
}

sealed class StubXml : MediaBrowser.Model.Serialization.IXmlSerializer
{
    public void SerializeToStream(object obj, Stream stream) { }
    public void SerializeToFile(object obj, string file) { }
    public object DeserializeFromFile(Type type, string file)
        => throw new FileNotFoundException("stub serializer", file);
    public object DeserializeFromStream(Type type, Stream stream)
        => throw new NotSupportedException();
    public object DeserializeFromBytes(Type type, byte[] buffer)
        => throw new NotSupportedException();
}
