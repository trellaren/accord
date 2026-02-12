from accord.cli import pass_environment

import click

@click.command("connect", short_help="Establish a connection to a server/channel/thread.")
@click.argument("join", required=False)
@click.argument("context", required=True)
@pass_environment
def cli(ctx):
    """Provides a list of available voice channels for a user to join"""
    click.echo()