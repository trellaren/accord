### Server will be used to establish connections to a server or to create 
# a server/channels for voip capability.

from accord.cli import pass_environment

import click

@click.command("server", short_help="Establish server connection.")
@click.argument("join", required=False)
@pass_environment
def cli(ctx, path):
    """Provides Server Details for connection"""
    click.echo()