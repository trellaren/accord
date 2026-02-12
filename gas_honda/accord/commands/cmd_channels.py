from accord.cli import pass_environment

import click

@click.command("channels", short_help="List of available voip channels on a server.")
@click.argument("join", required=False)
@pass_environment
def cli(ctx, path):
    """Provides a list of available voice channels for a user to join"""
    click.echo()