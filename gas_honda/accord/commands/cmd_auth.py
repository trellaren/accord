from accord.cli import pass_environment

import click

@click.command("auth", short_help="Authenticate to the application/server.")
@click.argument("username", required=True)
@click.argument("password", required=True)
@pass_environment
def cli(ctx, path):
    """User Authentication"""
    click.echo()