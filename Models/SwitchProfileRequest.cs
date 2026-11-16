using System;

namespace Jellyfin.Profiles.Models
{
    public class SwitchProfileRequest
    {
        public Guid ProfileId { get; set; }
        public string? Pin { get; set; }

        /// <summary>
        /// The app asks for the PIN every time (Moonfin's "Always ask for password"): a profile with a
        /// PIN must give it, even where the home network, a trusted address or the main account's
        /// settings would skip it. Only ever stricter. Default false.
        /// </summary>
        public bool AlwaysAsk { get; set; }

        /// <summary>
        /// /switch only. When true, the access token that made this request is ended once the
        /// new one exists, so a client need not call POST /Sessions/Logout itself. Default false.
        /// </summary>
        public bool EndPreviousSession { get; set; }
    }
}
