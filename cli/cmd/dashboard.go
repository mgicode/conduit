package cmd

import (
	"fmt"
	"log"
	"github.com/pkg/browser"
	"github.com/spf13/cobra"
	"github.com/runconduit/conduit/cli/shell"
)

var (
	proxyPort = -1
)

var dashboardCmd = &cobra.Command{
	Use:   "dashboard [flags]",
	Short: "Open the Conduit dashboard in a web browser",
	Long:  "Open the Conduit dashboard in a web browser.",
	RunE: func(cmd *cobra.Command, args []string) error {
		if proxyPort <= 0 {
			log.Fatalf("port must be positive, was %d", proxyPort)
		}

		kubectl := shell.MakeKubectl(shell.MakeUnixShell())

		asyncProcessErr, err := kubectl.StartProxy(proxyPort)

		if err != nil {
			log.Fatalf("Failed to start kubectl proxy: %v", err)
		}

		url, err := kubectl.UrlFor(controlPlaneNamespace, "/services/web:http/proxy/")

		if err != nil {
			log.Fatalf("Failed to generate URL for dashboard: %v", err)
		}

		fmt.Printf("Opening [%s] in the default browser\n", url)
		err = browser.OpenURL(url)

		if err != nil {
			log.Fatalf("failed to open URL %s in the default browser: %v", url, err)
		}

		select {
		case err = <-asyncProcessErr:
			if err != nil {
				log.Fatalf("Error starting proxy via kubectl: %v", err)
			}
		}

		return nil
	},
}

func init() {
	RootCmd.AddCommand(dashboardCmd)
	dashboardCmd.Args = cobra.NoArgs

	// This is identical to what `kubectl proxy --help` reports, except
	// `kubectl proxy` allows `--port=0` to indicate a random port; That's
	// inconvenient to support so it isn't supported.
	dashboardCmd.PersistentFlags().IntVarP(&proxyPort, "port", "p", 8001, "The port on which to run the proxy, which must not be 0.")
}
